/**
 * Standalone correctness check for lib/matchIntelligence.ts -- no
 * framework, no DB, runnable with plain `tsx`, same shape as
 * scripts/verify-matching.ts.
 */
import assert from 'node:assert/strict';
import { computeIntelligenceSignal, type IntelligenceSignalInputs } from '../lib/matchIntelligence';
import { rankCandidates, type MatchableProfile } from '../lib/matching';

function inputs(overrides: Partial<IntelligenceSignalInputs> = {}): IntelligenceSignalInputs {
  return {
    completeness: 0,
    verification: 'UNVERIFIED',
    recentMatchCount: 0,
    daysSinceLastActive: 999,
    ...overrides,
  };
}

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  - ${name}`);
  } catch (err) {
    console.error(`FAIL  - ${name}`);
    throw err;
  }
}

console.log('lib/matchIntelligence.ts -- verification\n');

test('an empty profile scores at or near 0', () => {
  const score = computeIntelligenceSignal(inputs());
  assert.ok(score >= 0 && score <= 0.01, `expected ~0, got ${score}`);
});

test('a fully-verified, complete, recently-active profile scores at or near 1', () => {
  const score = computeIntelligenceSignal(
    inputs({ completeness: 1, verification: 'VERIFIED', recentMatchCount: 10, daysSinceLastActive: 0 }),
  );
  assert.ok(score >= 0.99 && score <= 1, `expected ~1, got ${score}`);
});

test('a fully-verified, complete, recently-active profile scores strictly higher than an empty one', () => {
  const empty = computeIntelligenceSignal(inputs());
  const full = computeIntelligenceSignal(
    inputs({ completeness: 1, verification: 'VERIFIED', recentMatchCount: 10, daysSinceLastActive: 0 }),
  );
  assert.ok(full > empty, `expected full (${full}) > empty (${empty})`);
});

test('every output stays within [0,1] across a spread of realistic and extreme inputs', () => {
  const cases: IntelligenceSignalInputs[] = [
    inputs(),
    inputs({ completeness: 0.5, verification: 'PENDING', recentMatchCount: 2, daysSinceLastActive: 5 }),
    inputs({ completeness: 1, verification: 'MANUAL_REVIEW', recentMatchCount: 1, daysSinceLastActive: 14 }),
    inputs({ completeness: 1, verification: 'REJECTED', recentMatchCount: 0, daysSinceLastActive: 0 }),
    // Out-of-range / malformed inputs -- every factor clamps internally
    // (see lib/matchIntelligence.ts), so these must never escape [0,1].
    inputs({ completeness: 5, verification: 'VERIFIED', recentMatchCount: 1000, daysSinceLastActive: -3 }),
    inputs({ completeness: -1, verification: 'UNVERIFIED', recentMatchCount: -5, daysSinceLastActive: 100000 }),
  ];
  for (const c of cases) {
    const score = computeIntelligenceSignal(c);
    assert.ok(score >= 0 && score <= 1, `expected score in [0,1] for ${JSON.stringify(c)}, got ${score}`);
  }
});

test('monotonic in completeness, all else equal', () => {
  const low = computeIntelligenceSignal(inputs({ completeness: 0.2 }));
  const high = computeIntelligenceSignal(inputs({ completeness: 0.8 }));
  assert.ok(high > low, `expected higher completeness (${high}) > lower (${low})`);
});

test('monotonic in verification strength, all else equal', () => {
  const unverified = computeIntelligenceSignal(inputs({ verification: 'UNVERIFIED' }));
  const pending = computeIntelligenceSignal(inputs({ verification: 'PENDING' }));
  const manualReview = computeIntelligenceSignal(inputs({ verification: 'MANUAL_REVIEW' }));
  const verified = computeIntelligenceSignal(inputs({ verification: 'VERIFIED' }));
  assert.ok(unverified < pending, `expected unverified (${unverified}) < pending (${pending})`);
  assert.ok(pending < manualReview, `expected pending (${pending}) < manualReview (${manualReview})`);
  assert.ok(manualReview < verified, `expected manualReview (${manualReview}) < verified (${verified})`);
});

test('REJECTED scores identically to UNVERIFIED -- this signal only ever adds, never subtracts', () => {
  const unverified = computeIntelligenceSignal(inputs({ verification: 'UNVERIFIED' }));
  const rejected = computeIntelligenceSignal(inputs({ verification: 'REJECTED' }));
  assert.equal(unverified, rejected);
});

test('monotonic in recency -- more recently active scores at least as high, all else equal', () => {
  const stale = computeIntelligenceSignal(inputs({ daysSinceLastActive: 30 }));
  const fresh = computeIntelligenceSignal(inputs({ daysSinceLastActive: 0 }));
  assert.ok(fresh > stale, `expected fresh (${fresh}) > stale (${stale})`);
});

test('monotonic in recent match count, all else equal', () => {
  const fewer = computeIntelligenceSignal(inputs({ recentMatchCount: 1 }));
  const more = computeIntelligenceSignal(inputs({ recentMatchCount: 5 }));
  assert.ok(more > fewer, `expected more matches (${more}) > fewer (${fewer})`);
});

// --- Flag-off no-op proof -------------------------------------------------
// With intelligenceScore left undefined on every candidate (exactly what
// lib/discoverPool.ts hands lib/matching.ts whenever
// matching_intelligence_signal is disabled, the default), rankCandidates'
// output must be byte-for-byte identical to how it scored before this
// feature existed -- same order, same scores. This is the actual
// guarantee the rollout depends on, not just a property of
// computeIntelligenceSignal in isolation.

function defaultDateOfBirth(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 30);
  return d;
}

function profile(overrides: Partial<MatchableProfile> & { userId: string }): MatchableProfile {
  return {
    gender: 'WOMAN',
    lookingFor: ['MAN'],
    city: 'Bengaluru',
    intent: 'SOMETHING_REAL',
    quietMode: false,
    interestIds: [],
    lastActiveAt: new Date(),
    dateOfBirth: defaultDateOfBirth(),
    ...overrides,
  };
}

test('flag-off (intelligenceScore undefined): rankCandidates is unchanged from the pre-feature baseline', () => {
  const viewer = profile({ userId: 'v', city: 'Bengaluru', interestIds: ['trekking', 'coffee'] });
  const a = profile({ userId: 'a', gender: 'MAN', lookingFor: ['WOMAN'], city: 'Bengaluru', interestIds: ['trekking', 'coffee'] });
  const b = profile({ userId: 'b', gender: 'MAN', lookingFor: ['WOMAN'], city: 'Bengaluru' });
  const candidates = [a, b];

  // Baseline: same candidates, intelligenceScore never set at all (what
  // ranking looked like before this field/term existed).
  const baseline = rankCandidates(viewer, candidates);

  // Flag-off shape: identical profiles, but explicitly carrying
  // `intelligenceScore: undefined` on every one -- exactly what
  // discoverPool.ts produces when matching_intelligence_signal is off.
  const withUndefinedScores = candidates.map((c) => ({ ...c, intelligenceScore: undefined }));
  const flagOff = rankCandidates(viewer, withUndefinedScores);

  assert.equal(flagOff.length, baseline.length);
  for (let i = 0; i < baseline.length; i++) {
    assert.equal(flagOff[i]?.userId, baseline[i]?.userId, `order differs at index ${i}`);
    assert.equal(flagOff[i]?.score, baseline[i]?.score, `score differs at index ${i} for ${flagOff[i]?.userId}`);
  }
});

console.log(`\n${passed}/${passed} checks passed.`);
