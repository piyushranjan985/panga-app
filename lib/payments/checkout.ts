// lib/payments/checkout.ts
//
// The one place that mutates Transaction/Subscription/CreditBalance/
// Invoice state. createCheckout() never trusts a client-supplied price or
// plan -- it always re-reads the PaymentPlan row server-side and computes
// amount/discount/GST/total itself. applyGatewayEvent() is shared by
// confirmCheckout() (the mock "checkout result" path) and would equally
// back a real webhook handler later, so idempotency/out-of-order handling
// is only implemented once. See docs/PAYMENTS.md.

import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getPaymentsAccess } from './flags';
import { getGatewayAdapter } from './gatewayFactory';
import { generateIdempotencyKey } from './idempotency';
import { calculateGst, type GstBreakdown } from './gst';
import { applyDiscount } from './discount';

export class FreeTierCheckoutBlockedError extends Error {
  constructor() {
    super('Checkout is not reachable while Free_Tier is on.');
  }
}
export class PlanNotFoundError extends Error {}
export class InvalidPromoCodeError extends Error {}
export class TransactionNotFoundError extends Error {}

// Placeholder until FindMyVybe's real GST-registered state is known --
// see the findings doc's compliance checklist. Wrong until then, but
// harmless while PAYMENT_MODE=mock since no real invoice is ever issued
// off of it; must be set correctly before go-live.
const GST_SUPPLIER_STATE_CODE = (process.env.GST_SUPPLIER_STATE_CODE || 'DL').trim().toUpperCase();

export interface CreateCheckoutInput {
  userId: string;
  planId: string;
  promoCode?: string;
  placeOfSupplyStateCode?: string;
  idempotencyKey?: string;
}

export interface CheckoutState {
  transactionId: string;
  gatewayOrderId: string;
  gateway: string;
  amountInPaise: number;
  discountInPaise: number;
  gstInPaise: number;
  totalInPaise: number;
  status: string;
}

export async function createCheckout(input: CreateCheckoutInput): Promise<CheckoutState> {
  const access = getPaymentsAccess();
  if (!access.checkoutReachable) throw new FreeTierCheckoutBlockedError();

  const idempotencyKey = input.idempotencyKey || generateIdempotencyKey();

  // Idempotent re-entry: a retried request with the same key returns the
  // existing transaction's current state instead of creating a second one.
  const existing = await db.transaction.findUnique({ where: { idempotencyKey } });
  if (existing) return toCheckoutState(existing);

  const plan = await db.paymentPlan.findUnique({ where: { id: input.planId } });
  if (!plan || !plan.isActive) throw new PlanNotFoundError('Plan not found or not active.');

  const promo = await resolvePromoCode(input.promoCode, plan.id);

  const amountInPaise = plan.priceInPaise;
  const discountInPaise = applyDiscount(
    amountInPaise,
    promo ? { discountType: promo.discountType, discountValue: promo.discountValue } : null,
  );
  const taxableAmountInPaise = amountInPaise - discountInPaise;
  const gst = calculateGst({
    taxableAmountInPaise,
    supplierStateCode: GST_SUPPLIER_STATE_CODE,
    placeOfSupplyStateCode: input.placeOfSupplyStateCode,
  });
  const totalInPaise = taxableAmountInPaise + gst.totalGstInPaise;

  const adapter = getGatewayAdapter();

  // Created with status CREATED and no gatewayOrderId first, so a crash
  // between this insert and the adapter call below still leaves a
  // reconcilable row rather than nothing.
  const transaction = await db.transaction.create({
    data: {
      userId: input.userId,
      planId: plan.id,
      kind: plan.kind,
      gateway: adapter.name,
      status: 'CREATED',
      idempotencyKey,
      amountInPaise,
      discountInPaise,
      gstInPaise: gst.totalGstInPaise,
      totalInPaise,
      promoCodeId: promo?.id,
      metadata: { placeOfSupplyStateCode: input.placeOfSupplyStateCode ?? null, gstBreakdown: gst } as unknown as Prisma.InputJsonValue,
    },
  });

  const order = await adapter.createOrder({
    transactionId: transaction.id,
    amountInPaise: totalInPaise,
    currency: transaction.currency,
    receipt: transaction.id,
  });

  const updated = await db.transaction.update({
    where: { id: transaction.id },
    data: { gatewayOrderId: order.gatewayOrderId, status: 'PENDING' },
  });

  return toCheckoutState(updated);
}

async function resolvePromoCode(rawCode: string | undefined, planId: string) {
  if (!rawCode) return null;
  const promo = await db.promoCode.findUnique({ where: { code: rawCode.trim().toUpperCase() } });
  const now = new Date();
  const valid =
    !!promo &&
    promo.isActive &&
    promo.validFrom <= now &&
    (!promo.validUntil || promo.validUntil >= now) &&
    (promo.maxRedemptions === null || promo.redemptionCount < promo.maxRedemptions) &&
    (promo.applicablePlanIds.length === 0 || promo.applicablePlanIds.includes(planId));
  if (!valid) throw new InvalidPromoCodeError('This promo code is not valid for this plan right now.');
  return promo;
}

function toCheckoutState(t: { id: string; gatewayOrderId: string | null; gateway: string; amountInPaise: number; discountInPaise: number; gstInPaise: number; totalInPaise: number; status: string }): CheckoutState {
  return {
    transactionId: t.id,
    gatewayOrderId: t.gatewayOrderId ?? '',
    gateway: t.gateway,
    amountInPaise: t.amountInPaise,
    discountInPaise: t.discountInPaise,
    gstInPaise: t.gstInPaise,
    totalInPaise: t.totalInPaise,
    status: t.status,
  };
}

export interface ConfirmCheckoutInput {
  transactionId: string;
  /** Re-checked against the transaction's own userId -- never trust a client-supplied user id alone to resolve which transaction this is. */
  userId: string;
  /** Mock-mode testing knob only; a real adapter ignores this. */
  simulate?: 'success' | 'failure' | 'pending';
}

export interface ConfirmCheckoutResult {
  status: string;
  transactionId: string;
}

export async function confirmCheckout(input: ConfirmCheckoutInput): Promise<ConfirmCheckoutResult> {
  const transaction = await db.transaction.findUnique({ where: { id: input.transactionId } });
  if (!transaction || transaction.userId !== input.userId) throw new TransactionNotFoundError();

  if (transaction.status === 'SUCCEEDED' || transaction.status === 'FAILED') {
    // Already resolved -- idempotent no-op, not an error.
    return { status: transaction.status, transactionId: transaction.id };
  }

  const adapter = getGatewayAdapter();
  const result = await adapter.confirmPayment({ gatewayOrderId: transaction.gatewayOrderId ?? '', simulate: input.simulate });
  return applyGatewayEvent(transaction.id, result);
}

export interface GatewayEvent {
  status: 'succeeded' | 'failed' | 'pending';
  gatewayPaymentId: string;
  eventType: string;
  externalEventId: string;
  payload: Record<string, unknown>;
}

const TERMINAL_STATUSES = ['SUCCEEDED', 'FAILED', 'REFUNDED'];

// Shared by confirmCheckout() above and (eventually) a real webhook
// handler -- this is the one place that actually mutates Transaction/
// Subscription/CreditBalance/Invoice state off of a gateway event.
export async function applyGatewayEvent(transactionId: string, event: GatewayEvent): Promise<ConfirmCheckoutResult> {
  return db.$transaction(async (tx) => {
    // The unique (transactionId, eventType, externalEventId) index is the
    // real idempotency guard -- a retried/duplicate event throws P2002
    // here, which we treat as "already applied", not an error.
    try {
      await tx.transactionEvent.create({
        data: { transactionId, eventType: event.eventType, externalEventId: event.externalEventId, payload: event.payload as Prisma.InputJsonValue },
      });
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        const current = await tx.transaction.findUniqueOrThrow({ where: { id: transactionId } });
        return { status: current.status, transactionId };
      }
      throw err;
    }

    const transaction = await tx.transaction.findUniqueOrThrow({ where: { id: transactionId }, include: { plan: true } });

    // Out-of-order guard: a terminal status is never overwritten by a
    // late-arriving pending/duplicate event for the same transaction.
    if (TERMINAL_STATUSES.includes(transaction.status)) {
      return { status: transaction.status, transactionId };
    }

    if (event.status === 'pending') {
      await tx.transaction.update({ where: { id: transactionId }, data: { status: 'PENDING', gatewayPaymentId: event.gatewayPaymentId } });
      return { status: 'PENDING', transactionId };
    }

    if (event.status === 'failed') {
      await tx.transaction.update({ where: { id: transactionId }, data: { status: 'FAILED', gatewayPaymentId: event.gatewayPaymentId } });
      return { status: 'FAILED', transactionId };
    }

    // succeeded
    await tx.transaction.update({ where: { id: transactionId }, data: { status: 'SUCCEEDED', gatewayPaymentId: event.gatewayPaymentId } });

    if (transaction.plan && transaction.kind === 'SUBSCRIPTION') {
      const periodDays = transaction.plan.billingInterval === 'ANNUAL' ? 365 : transaction.plan.billingInterval === 'QUARTERLY' ? 90 : 30;
      const now = new Date();
      const periodEnd = new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000);
      const subscription = await tx.subscription.create({
        data: { userId: transaction.userId, planId: transaction.plan.id, status: 'ACTIVE', currentPeriodStart: now, currentPeriodEnd: periodEnd },
      });
      await tx.transaction.update({ where: { id: transactionId }, data: { subscriptionId: subscription.id } });
    } else if (transaction.plan && transaction.kind === 'CREDIT_PACK' && transaction.plan.creditAmount) {
      await tx.creditBalance.upsert({
        where: { userId: transaction.userId },
        create: { userId: transaction.userId, balance: transaction.plan.creditAmount },
        update: { balance: { increment: transaction.plan.creditAmount } },
      });
      await tx.creditLedgerEntry.create({
        data: { userId: transaction.userId, delta: transaction.plan.creditAmount, reason: 'credit_pack_purchase', transactionId: transaction.id },
      });
    }

    if (transaction.promoCodeId) {
      await tx.promoRedemption.create({ data: { promoCodeId: transaction.promoCodeId, userId: transaction.userId, transactionId: transaction.id } });
      await tx.promoCode.update({ where: { id: transaction.promoCodeId }, data: { redemptionCount: { increment: 1 } } });
    }

    const paymentsAccess = getPaymentsAccess();
    const invoiceNumber = `MOCK-${new Date().getFullYear()}-${transaction.id.slice(-8).toUpperCase()}`;
    const metadata = (transaction.metadata ?? {}) as { placeOfSupplyStateCode?: string | null; gstBreakdown?: GstBreakdown };
    await tx.invoice.create({
      data: {
        transactionId: transaction.id,
        userId: transaction.userId,
        invoiceNumber,
        subtotalInPaise: transaction.amountInPaise - transaction.discountInPaise,
        discountInPaise: transaction.discountInPaise,
        gstInPaise: transaction.gstInPaise,
        totalInPaise: transaction.totalInPaise,
        placeOfSupply: metadata.placeOfSupplyStateCode ?? null,
        gstBreakdown: (metadata.gstBreakdown ?? {}) as Prisma.InputJsonValue,
        isMock: paymentsAccess.paymentMode === 'mock',
      },
    });

    return { status: 'SUCCEEDED', transactionId };
  });
}

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code?: string }).code === 'P2002';
}
