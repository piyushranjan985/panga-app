// lib/payments/flags.ts
//
// The two mandatory, server-only, plain-process.env switches that gate
// the entire payments domain -- never admin-mutable, never read from the
// database (see admin/lib/payments/flags.ts for the admin app's copy of
// this exact logic, and docs/PAYMENTS.md for the full writeup). Every
// invalid/unset value fails safe toward the free, no-money-moves state.
// The acceptance matrix this implements is tested in
// tests/paymentFlags.test.ts.
//
// Free_Tier (default/unset/invalid -> true): when true, every user is on
// the free tier regardless of subscription history, and checkout is not
// reachable at all.
//
// PAYMENT_MODE (default 'mock'): only consulted once Free_Tier is false.
// 'live' additionally requires LIVE_PAYMENTS_CONFIRMED=true -- a second,
// independent switch -- before any adapter other than the mock one is
// ever constructed (see lib/payments/gatewayFactory.ts). Setting
// Free_Tier=false never by itself enables live payments.

function readBooleanEnv(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined) return defaultValue;
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  // Any other value (typo, empty string, "1", "yes", ...) fails safe to
  // the default rather than guessing what was meant.
  return defaultValue;
}

export function isFreeTier(): boolean {
  return readBooleanEnv(process.env.Free_Tier, true);
}

export type PaymentMode = 'mock' | 'live';

export function getPaymentMode(): PaymentMode {
  const raw = (process.env.PAYMENT_MODE ?? '').trim().toLowerCase();
  return raw === 'live' ? 'live' : 'mock'; // any unset/invalid value fails safe to 'mock'
}

export function isLiveActivationConfirmed(): boolean {
  return readBooleanEnv(process.env.LIVE_PAYMENTS_CONFIRMED, false);
}

export interface PaymentsAccess {
  freeTier: boolean;
  paymentMode: PaymentMode;
  /** false whenever Free_Tier is true -- checkout/payment APIs return a clear "not available" response rather than proceeding. */
  checkoutReachable: boolean;
  /** true only in the single acceptance-matrix row where real money can move: Free_Tier=false, PAYMENT_MODE=live, LIVE_PAYMENTS_CONFIRMED=true. */
  liveGatewayActive: boolean;
}

// What the rest of the payments code actually asks -- the one function
// that implements the full acceptance matrix in one place.
export function getPaymentsAccess(): PaymentsAccess {
  const freeTier = isFreeTier();
  const paymentMode = getPaymentMode();
  const liveGatewayActive = !freeTier && paymentMode === 'live' && isLiveActivationConfirmed();
  return { freeTier, paymentMode, checkoutReachable: !freeTier, liveGatewayActive };
}
