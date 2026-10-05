import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeProgressiveCooldownSeconds,
  isSuspiciousPhoneNumber,
  evaluateOtpRequestCounts,
  getOtpRateLimitConfig,
  clientIpFromRequest,
  type OtpRequestLimits,
  type OtpRequestCounts,
} from '../lib/otpRateLimit';

// Deliberately NOT importing lib/otp.ts here -- it pulls in lib/db.ts
// (a real Prisma client against DATABASE_URL), same reason
// admin/tests/*.test.ts only ever exercise DB-free pure-logic files.
// lib/otpRateLimit.ts is written specifically to have zero such
// dependencies -- see its own top-of-file comment.

describe('lib/otpRateLimit -- computeProgressiveCooldownSeconds', () => {
  test('a destination with no recent requests gets the plain base cooldown', () => {
    assert.equal(computeProgressiveCooldownSeconds(60, 0, 1800), 60);
  });

  test('one recent request doubles the cooldown', () => {
    assert.equal(computeProgressiveCooldownSeconds(60, 1, 1800), 120);
  });

  test('escalation keeps doubling with each additional recent request', () => {
    assert.equal(computeProgressiveCooldownSeconds(60, 2, 1800), 240);
    assert.equal(computeProgressiveCooldownSeconds(60, 3, 1800), 480);
  });

  test('never exceeds the configured cap, however many recent requests there were', () => {
    assert.equal(computeProgressiveCooldownSeconds(60, 10, 1800), 1800);
    assert.equal(computeProgressiveCooldownSeconds(60, 1000, 1800), 1800);
  });

  test('a negative count (shouldn\'t happen, but) is treated the same as zero', () => {
    assert.equal(computeProgressiveCooldownSeconds(60, -1, 1800), 60);
  });
});

describe('lib/otpRateLimit -- isSuspiciousPhoneNumber', () => {
  test('flags the canonical ascending/descending 10-digit test patterns', () => {
    assert.equal(isSuspiciousPhoneNumber('+919876543210'), true);
    assert.equal(isSuspiciousPhoneNumber('+911234567890'), true);
    assert.equal(isSuspiciousPhoneNumber('9876543210'), true); // works without the +91 prefix too
  });

  test('flags ten identical digits', () => {
    assert.equal(isSuspiciousPhoneNumber('+917777777777'), true);
  });

  test('does not flag an ordinary-looking real number', () => {
    assert.equal(isSuspiciousPhoneNumber('+919876501234'), false);
  });

  test('does not flag a value that is not a 10-digit shape at all', () => {
    assert.equal(isSuspiciousPhoneNumber('not-a-phone-number'), false);
    assert.equal(isSuspiciousPhoneNumber('+9198765'), false);
  });
});

describe('lib/otpRateLimit -- evaluateOtpRequestCounts', () => {
  const limits: OtpRequestLimits = {
    destinationPerHour: 5,
    destinationPerDay: 10,
    ipPerHour: 20,
    ipPerDay: 60,
    globalPerHour: null,
  };

  function counts(overrides: Partial<OtpRequestCounts> = {}): OtpRequestCounts {
    return { destinationHour: 0, destinationDay: 0, ipHour: 0, ipDay: 0, globalHour: null, ...overrides };
  }

  test('allows a request comfortably under every limit', () => {
    assert.deepEqual(evaluateOtpRequestCounts(limits, counts()), { ok: true });
  });

  test('rejects on the destination hourly limit before anything else', () => {
    const decision = evaluateOtpRequestCounts(limits, counts({ destinationHour: 5 }));
    assert.deepEqual(decision, { ok: false, reason: 'destination_hourly_limit' });
  });

  test('rejects on the destination daily limit once the hourly one is satisfied', () => {
    const decision = evaluateOtpRequestCounts(limits, counts({ destinationDay: 10 }));
    assert.deepEqual(decision, { ok: false, reason: 'destination_daily_limit' });
  });

  test('a suspicious-number override (daily limit of 1) rejects the second request of the day', () => {
    const tightened: OtpRequestLimits = { ...limits, destinationPerDay: 1 };
    assert.deepEqual(evaluateOtpRequestCounts(tightened, counts({ destinationDay: 0 })), { ok: true });
    assert.deepEqual(evaluateOtpRequestCounts(tightened, counts({ destinationDay: 1 })), {
      ok: false,
      reason: 'destination_daily_limit',
    });
  });

  test('rejects on IP limits once destination limits are satisfied', () => {
    assert.deepEqual(evaluateOtpRequestCounts(limits, counts({ ipHour: 20 })), { ok: false, reason: 'ip_hourly_limit' });
    assert.deepEqual(evaluateOtpRequestCounts(limits, counts({ ipDay: 60 })), { ok: false, reason: 'ip_daily_limit' });
  });

  test('never enforces an IP limit when no IP was available (null count, not zero)', () => {
    assert.deepEqual(evaluateOtpRequestCounts(limits, counts({ ipHour: null, ipDay: null })), { ok: true });
  });

  test('a configured global limit is enforced last, after destination and IP both pass', () => {
    const withGlobal: OtpRequestLimits = { ...limits, globalPerHour: 100 };
    assert.deepEqual(evaluateOtpRequestCounts(withGlobal, counts({ globalHour: 100 })), {
      ok: false,
      reason: 'global_hourly_limit',
    });
    assert.deepEqual(evaluateOtpRequestCounts(withGlobal, counts({ globalHour: 99 })), { ok: true });
  });

  test('an unconfigured global limit (null) is never enforced, whatever the global count is', () => {
    assert.deepEqual(evaluateOtpRequestCounts(limits, counts({ globalHour: 100000 })), { ok: true });
  });
});

describe('lib/otpRateLimit -- getOtpRateLimitConfig (env-driven defaults)', () => {
  function withEnv(overrides: Record<string, string | undefined>, fn: () => void) {
    const previous: Record<string, string | undefined> = {};
    for (const key of Object.keys(overrides)) previous[key] = process.env[key];
    try {
      for (const [key, value] of Object.entries(overrides)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      fn();
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }

  test('sensible defaults apply when nothing is set', () => {
    withEnv(
      {
        OTP_ENABLED: undefined,
        OTP_MAX_REQUESTS_PER_PHONE_PER_HOUR: undefined,
        OTP_MAX_REQUESTS_GLOBAL_PER_HOUR: undefined,
      },
      () => {
        const config = getOtpRateLimitConfig();
        assert.equal(config.enabled, true);
        assert.equal(config.maxPerPhonePerHour, 5);
        assert.equal(config.maxGlobalPerHour, null);
      },
    );
  });

  test('OTP_ENABLED="false" is the only value that disables issuance', () => {
    withEnv({ OTP_ENABLED: 'false' }, () => assert.equal(getOtpRateLimitConfig().enabled, false));
    withEnv({ OTP_ENABLED: 'nope' }, () => assert.equal(getOtpRateLimitConfig().enabled, true)); // anything other than exactly "false" leaves it on
  });

  test('a numeric override is respected', () => {
    withEnv({ OTP_MAX_REQUESTS_PER_PHONE_PER_DAY: '3' }, () => {
      assert.equal(getOtpRateLimitConfig().maxPerPhonePerDay, 3);
    });
  });

  test('a garbage override falls back to the default instead of NaN', () => {
    withEnv({ OTP_MAX_REQUESTS_PER_PHONE_PER_DAY: 'not-a-number' }, () => {
      assert.equal(getOtpRateLimitConfig().maxPerPhonePerDay, 10);
    });
  });

  test('OTP_MAX_REQUESTS_GLOBAL_PER_HOUR is null unless explicitly set to a positive number', () => {
    withEnv({ OTP_MAX_REQUESTS_GLOBAL_PER_HOUR: '500' }, () => {
      assert.equal(getOtpRateLimitConfig().maxGlobalPerHour, 500);
    });
    withEnv({ OTP_MAX_REQUESTS_GLOBAL_PER_HOUR: '0' }, () => {
      assert.equal(getOtpRateLimitConfig().maxGlobalPerHour, null); // 0 isn't a meaningful cap -- treated as unset
    });
  });
});

describe('lib/otpRateLimit -- clientIpFromRequest', () => {
  test('prefers the first address in a comma-separated x-forwarded-for', () => {
    const req = new Request('https://example.com', { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } });
    assert.equal(clientIpFromRequest(req), '1.2.3.4');
  });

  test('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const req = new Request('https://example.com', { headers: { 'x-real-ip': '9.9.9.9' } });
    assert.equal(clientIpFromRequest(req), '9.9.9.9');
  });

  test('returns null when neither header is present', () => {
    const req = new Request('https://example.com');
    assert.equal(clientIpFromRequest(req), null);
  });
});
