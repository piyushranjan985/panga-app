// Deliberately NOT importing anything from lib/payments/checkout.ts or
// lib/payments/entitlements.ts here -- those pull in lib/db.ts (a real
// Prisma client against DATABASE_URL), same reason the rest of this
// project's tests/*.test.ts files stick to DB-free pure-logic modules.
// lib/payments/flags.ts is written specifically to have zero such
// dependency, so the full acceptance matrix from the brief can be
// exercised here with nothing but process.env.

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { isFreeTier, getPaymentMode, isLiveActivationConfirmed, getPaymentsAccess } from '../lib/payments/flags';

const ENV_KEYS = ['Free_Tier', 'PAYMENT_MODE', 'LIVE_PAYMENTS_CONFIRMED'] as const;
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('lib/payments/flags -- isFreeTier', () => {
  test('unset defaults to true', () => assert.equal(isFreeTier(), true));
  test('invalid value defaults to true (fail-safe)', () => {
    process.env.Free_Tier = 'nope';
    assert.equal(isFreeTier(), true);
  });
  test('empty string defaults to true (fail-safe)', () => {
    process.env.Free_Tier = '';
    assert.equal(isFreeTier(), true);
  });
  test('"false" (any case) turns it off', () => {
    process.env.Free_Tier = 'False';
    assert.equal(isFreeTier(), false);
  });
  test('"true" keeps it on explicitly', () => {
    process.env.Free_Tier = 'true';
    assert.equal(isFreeTier(), true);
  });
});

describe('lib/payments/flags -- getPaymentMode', () => {
  test('unset defaults to mock', () => assert.equal(getPaymentMode(), 'mock'));
  test('invalid value defaults to mock (fail-safe)', () => {
    process.env.PAYMENT_MODE = 'production';
    assert.equal(getPaymentMode(), 'mock');
  });
  test('"live" (any case) selects live', () => {
    process.env.PAYMENT_MODE = 'LIVE';
    assert.equal(getPaymentMode(), 'live');
  });
});

describe('lib/payments/flags -- isLiveActivationConfirmed', () => {
  test('unset defaults to false', () => assert.equal(isLiveActivationConfirmed(), false));
  test('invalid value defaults to false (fail-safe)', () => {
    process.env.LIVE_PAYMENTS_CONFIRMED = 'yes';
    assert.equal(isLiveActivationConfirmed(), false);
  });
  test('"true" turns it on', () => {
    process.env.LIVE_PAYMENTS_CONFIRMED = 'true';
    assert.equal(isLiveActivationConfirmed(), true);
  });
});

// The exact acceptance matrix from the brief / findings doc.
describe('lib/payments/flags -- getPaymentsAccess acceptance matrix', () => {
  test('row 1: Free_Tier true (or unset/invalid), any PAYMENT_MODE -> checkout unreachable, no live gateway', () => {
    process.env.Free_Tier = 'true';
    process.env.PAYMENT_MODE = 'live';
    process.env.LIVE_PAYMENTS_CONFIRMED = 'true';
    const access = getPaymentsAccess();
    assert.equal(access.checkoutReachable, false);
    assert.equal(access.liveGatewayActive, false);
  });

  test('row 2: Free_Tier false, PAYMENT_MODE unset/invalid -> mock checkout only', () => {
    process.env.Free_Tier = 'false';
    process.env.PAYMENT_MODE = 'garbage';
    const access = getPaymentsAccess();
    assert.equal(access.checkoutReachable, true);
    assert.equal(access.paymentMode, 'mock');
    assert.equal(access.liveGatewayActive, false);
  });

  test('row 3: Free_Tier false, PAYMENT_MODE mock -> mock checkout only', () => {
    process.env.Free_Tier = 'false';
    process.env.PAYMENT_MODE = 'mock';
    const access = getPaymentsAccess();
    assert.equal(access.checkoutReachable, true);
    assert.equal(access.liveGatewayActive, false);
  });

  test('row 4: Free_Tier false, PAYMENT_MODE live, no explicit activation -> fails safe to mock, no live gateway', () => {
    process.env.Free_Tier = 'false';
    process.env.PAYMENT_MODE = 'live';
    const access = getPaymentsAccess();
    assert.equal(access.checkoutReachable, true);
    assert.equal(access.liveGatewayActive, false);
  });

  test('row 5: Free_Tier false, PAYMENT_MODE live, explicit activation -> the only row where real money can move', () => {
    process.env.Free_Tier = 'false';
    process.env.PAYMENT_MODE = 'live';
    process.env.LIVE_PAYMENTS_CONFIRMED = 'true';
    const access = getPaymentsAccess();
    assert.equal(access.checkoutReachable, true);
    assert.equal(access.liveGatewayActive, true);
  });

  test('Free_Tier=false never by itself enables live payments (PAYMENT_MODE still defaults to mock)', () => {
    process.env.Free_Tier = 'false';
    const access = getPaymentsAccess();
    assert.equal(access.paymentMode, 'mock');
    assert.equal(access.liveGatewayActive, false);
  });

  test('the two flags are independent: flipping PAYMENT_MODE alone never changes Free_Tier, and vice versa', () => {
    process.env.Free_Tier = 'true';
    process.env.PAYMENT_MODE = 'live';
    process.env.LIVE_PAYMENTS_CONFIRMED = 'true';
    assert.equal(isFreeTier(), true); // still true despite PAYMENT_MODE=live
    assert.equal(getPaymentMode(), 'live'); // still live despite Free_Tier=true (read independently)
    assert.equal(getPaymentsAccess().liveGatewayActive, false); // but Free_Tier=true still blocks real money moving
  });
});
