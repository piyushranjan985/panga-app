// Mirrors the root app's tests/paymentFlags.test.ts against this app's
// own copy of the logic (admin/lib/payments/flags.ts) -- both apps read
// the same two env vars independently, so both need their own coverage
// of the acceptance matrix.

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { isFreeTier, getPaymentMode, getPaymentsAccess } from '../lib/payments/flags';

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

describe('admin/lib/payments/flags -- fail-safe defaults', () => {
  test('Free_Tier unset/invalid defaults to true', () => {
    assert.equal(isFreeTier(), true);
    process.env.Free_Tier = 'whoops';
    assert.equal(isFreeTier(), true);
  });

  test('PAYMENT_MODE unset/invalid defaults to mock', () => {
    assert.equal(getPaymentMode(), 'mock');
    process.env.PAYMENT_MODE = 'whoops';
    assert.equal(getPaymentMode(), 'mock');
  });
});

describe('admin/lib/payments/flags -- getPaymentsAccess acceptance matrix', () => {
  test('Free_Tier true blocks checkout regardless of PAYMENT_MODE', () => {
    process.env.Free_Tier = 'true';
    process.env.PAYMENT_MODE = 'live';
    process.env.LIVE_PAYMENTS_CONFIRMED = 'true';
    const access = getPaymentsAccess();
    assert.equal(access.checkoutReachable, false);
    assert.equal(access.liveGatewayActive, false);
  });

  test('Free_Tier false + PAYMENT_MODE live + confirmed is the only live row', () => {
    process.env.Free_Tier = 'false';
    process.env.PAYMENT_MODE = 'live';
    process.env.LIVE_PAYMENTS_CONFIRMED = 'true';
    assert.equal(getPaymentsAccess().liveGatewayActive, true);
  });

  test('Free_Tier false + PAYMENT_MODE live WITHOUT confirmation stays mock-only', () => {
    process.env.Free_Tier = 'false';
    process.env.PAYMENT_MODE = 'live';
    assert.equal(getPaymentsAccess().liveGatewayActive, false);
  });
});
