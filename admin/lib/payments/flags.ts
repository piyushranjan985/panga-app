// admin/lib/payments/flags.ts
//
// Exact duplicate of the root app's lib/payments/flags.ts -- the two
// Next.js apps don't share a lib tree, and both must read the SAME two
// env vars the same way for the admin Gateway Configuration banner to be
// trustworthy. If you change the logic here, change it there too (and
// vice versa) -- see docs/PAYMENTS.md.

function readBooleanEnv(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined) return defaultValue;
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return defaultValue;
}

export function isFreeTier(): boolean {
  return readBooleanEnv(process.env.Free_Tier, true);
}

export type PaymentMode = 'mock' | 'live';

export function getPaymentMode(): PaymentMode {
  const raw = (process.env.PAYMENT_MODE ?? '').trim().toLowerCase();
  return raw === 'live' ? 'live' : 'mock';
}

export function isLiveActivationConfirmed(): boolean {
  return readBooleanEnv(process.env.LIVE_PAYMENTS_CONFIRMED, false);
}

export interface PaymentsAccess {
  freeTier: boolean;
  paymentMode: PaymentMode;
  checkoutReachable: boolean;
  liveGatewayActive: boolean;
}

export function getPaymentsAccess(): PaymentsAccess {
  const freeTier = isFreeTier();
  const paymentMode = getPaymentMode();
  const liveGatewayActive = !freeTier && paymentMode === 'live' && isLiveActivationConfirmed();
  return { freeTier, paymentMode, checkoutReachable: !freeTier, liveGatewayActive };
}
