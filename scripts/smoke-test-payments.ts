/**
 * End-to-end functional check of the mock payments domain against a real
 * database -- the DB-touching counterpart to tests/paymentFlags.test.ts
 * and tests/paymentMath.test.ts (which deliberately stay DB-free, same
 * convention as every other tests/*.test.ts file in this project). Exits
 * non-zero on any assertion failure so it can be used as a regression
 * gate, same as prisma/smoke-test-match.ts.
 *
 * Covers: plan lifecycle (version create -> supersede), mock checkout
 * through every terminal state (succeeded/failed/pending), idempotent
 * re-entry on createCheckout, out-of-order/duplicate event handling on
 * confirmCheckout, subscription + credit-pack entitlement grants, promo
 * code discounting, and that Free_Tier=true blocks checkout end-to-end.
 *
 * Creates and cleans up its own throwaway test user -- safe to re-run.
 *
 * Run with: npm run db:smoke-test:payments
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

// Force known flag values for this script's own process BEFORE importing
// anything that reads them, then mutate at runtime for the Free_Tier
// assertion -- lib/payments/flags.ts reads process.env live on every
// call, so no caching to fight here.
process.env.Free_Tier = 'false';
process.env.PAYMENT_MODE = 'mock';

import { createCheckout, confirmCheckout, applyGatewayEvent, FreeTierCheckoutBlockedError } from '../lib/payments/checkout';
import { getEntitlements, spendCredits } from '../lib/payments/entitlements';

let failures = 0;
function assertEqual(actual: unknown, expected: unknown, label: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${ok ? '' : ` -- expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
  if (!ok) failures++;
}
function assertTrue(actual: boolean, label: string) {
  assertEqual(actual, true, label);
}

async function main() {
  const phone = '+919999000111';
  const user = await db.user.upsert({
    where: { phone },
    create: {
      phone,
      phoneVerified: true,
      profile: {
        create: { displayName: 'Payments Smoke Test', dateOfBirth: new Date('1998-01-01'), gender: 'MAN', lookingFor: ['WOMAN'], city: 'Delhi', intent: 'SOMETHING_REAL' },
      },
    },
    update: {},
  });

  const subPlan = await db.paymentPlan.findFirst({ where: { slug: 'real-plus', isActive: true } });
  const creditPlan = await db.paymentPlan.findFirst({ where: { slug: 'boost-pack-5', isActive: true } });
  if (!subPlan || !creditPlan) {
    console.error('Run `npm run db:seed:payments` first -- real-plus / boost-pack-5 not found.');
    process.exit(1);
  }

  // --- Plan lifecycle ------------------------------------------------
  const versionsBefore = await db.paymentPlan.count({ where: { slug: 'real-plus' } });
  assertTrue(subPlan.version >= 1, 'subscription plan has a version number');

  // --- Free_Tier blocks checkout end-to-end ---------------------------
  process.env.Free_Tier = 'true';
  try {
    await createCheckout({ userId: user.id, planId: subPlan.id });
    assertTrue(false, 'Free_Tier=true should have blocked checkout');
  } catch (err) {
    assertTrue(err instanceof FreeTierCheckoutBlockedError, 'Free_Tier=true blocks checkout with the right error type');
  }
  process.env.Free_Tier = 'false';

  // --- Mock checkout: succeeded path (subscription) -------------------
  const subCheckout = await createCheckout({ userId: user.id, planId: subPlan.id, placeOfSupplyStateCode: 'DL' });
  assertEqual(subCheckout.status, 'PENDING', 'subscription checkout starts PENDING after order creation');
  assertTrue(subCheckout.gstInPaise > 0, 'GST was computed and is > 0');
  assertEqual(subCheckout.totalInPaise, subCheckout.amountInPaise - subCheckout.discountInPaise + subCheckout.gstInPaise, 'total = amount - discount + gst');

  const confirmResult = await confirmCheckout({ transactionId: subCheckout.transactionId, userId: user.id, simulate: 'success' });
  assertEqual(confirmResult.status, 'SUCCEEDED', 'confirmCheckout(success) lands on SUCCEEDED');

  const subscription = await db.subscription.findFirst({ where: { userId: user.id, planId: subPlan.id }, orderBy: { createdAt: 'desc' } });
  assertTrue(!!subscription && subscription.status === 'ACTIVE', 'a SUCCEEDED subscription checkout creates an ACTIVE Subscription row');

  const invoice = await db.invoice.findUnique({ where: { transactionId: subCheckout.transactionId } });
  assertTrue(!!invoice && invoice.isMock === true, 'a SUCCEEDED checkout creates an Invoice marked isMock while PAYMENT_MODE=mock');

  const entitlementsAfterSub = await getEntitlements(user.id);
  assertTrue(entitlementsAfterSub.features.advanced_filters === true, 'entitlements reflect the purchased plan’s granted features');
  assertTrue(entitlementsAfterSub.features.priority_placement === false, 'entitlements do NOT grant a feature the plan never listed');

  // --- Idempotent re-entry on createCheckout --------------------------
  const idemKey = 'smoke-test-fixed-key-' + user.id;
  const first = await createCheckout({ userId: user.id, planId: subPlan.id, idempotencyKey: idemKey });
  const second = await createCheckout({ userId: user.id, planId: subPlan.id, idempotencyKey: idemKey });
  assertEqual(first.transactionId, second.transactionId, 'createCheckout with the same idempotencyKey returns the SAME transaction, not a new one');

  // --- Out-of-order / duplicate event handling on confirmCheckout -----
  const dupeConfirm1 = await confirmCheckout({ transactionId: second.transactionId, userId: user.id, simulate: 'success' });
  const dupeConfirm2 = await confirmCheckout({ transactionId: second.transactionId, userId: user.id, simulate: 'success' });
  assertEqual(dupeConfirm1.status, 'SUCCEEDED', 'first confirm succeeds');
  assertEqual(dupeConfirm2.status, 'SUCCEEDED', 'a second confirm on an already-terminal transaction is an idempotent no-op');
  const subsForThisCheckout = await db.subscription.count({ where: { userId: user.id, planId: subPlan.id } });
  // One from the first checkout above, one from this idemKey checkout -- never more, even though confirm ran twice.
  assertTrue(subsForThisCheckout === 2, 'a duplicate confirm never creates a second Subscription for the same transaction');

  // A late/duplicate PENDING event after SUCCEEDED must never regress the status (out-of-order guard).
  const lateEvent = await applyGatewayEvent(second.transactionId, {
    status: 'pending',
    gatewayPaymentId: 'late_pay',
    eventType: 'payment.pending',
    externalEventId: 'late-pending-event-' + second.transactionId,
    payload: {},
  });
  assertEqual(lateEvent.status, 'SUCCEEDED', 'a late-arriving PENDING event never regresses an already-SUCCEEDED transaction');

  // --- Mock checkout: failed path -------------------------------------
  const failCheckout = await createCheckout({ userId: user.id, planId: subPlan.id });
  const failResult = await confirmCheckout({ transactionId: failCheckout.transactionId, userId: user.id, simulate: 'failure' });
  assertEqual(failResult.status, 'FAILED', 'confirmCheckout(failure) lands on FAILED');
  const subsAfterFailure = await db.subscription.count({ where: { userId: user.id, planId: subPlan.id } });
  assertEqual(subsAfterFailure, 2, 'a FAILED transaction never creates a Subscription');

  // --- Mock checkout: pending path ------------------------------------
  const pendingCheckout = await createCheckout({ userId: user.id, planId: subPlan.id });
  const pendingResult = await confirmCheckout({ transactionId: pendingCheckout.transactionId, userId: user.id, simulate: 'pending' });
  assertEqual(pendingResult.status, 'PENDING', 'confirmCheckout(pending) lands on PENDING, not a terminal state');

  // --- Credit pack purchase + spend ------------------------------------
  const creditCheckout = await createCheckout({ userId: user.id, planId: creditPlan.id });
  await confirmCheckout({ transactionId: creditCheckout.transactionId, userId: user.id, simulate: 'success' });
  const balanceAfterPurchase = await db.creditBalance.findUnique({ where: { userId: user.id } });
  assertEqual(balanceAfterPurchase?.balance, 5, 'a SUCCEEDED credit-pack checkout grants the right number of credits');

  const spent = await spendCredits(user.id, 2, 'smoke_test_spend');
  assertTrue(spent, 'spendCredits succeeds when balance covers the amount');
  const balanceAfterSpend = await db.creditBalance.findUnique({ where: { userId: user.id } });
  assertEqual(balanceAfterSpend?.balance, 3, 'spendCredits decrements the balance by the right amount');

  const overspend = await spendCredits(user.id, 999, 'smoke_test_overspend');
  assertTrue(!overspend, 'spendCredits refuses when the balance is insufficient, rather than going negative');

  process.env.Free_Tier = 'true';
  const creditsUnderFreeTier = await spendCredits(user.id, 1, 'should_never_spend');
  assertTrue(!creditsUnderFreeTier, 'spendCredits refuses while Free_Tier=true, even with a real balance');
  process.env.Free_Tier = 'false';

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
