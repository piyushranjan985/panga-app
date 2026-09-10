/**
 * Standalone correctness check for lib/matching.ts — no framework, no DB,
 * runnable with plain `tsx` or `ts-node`. This is the one piece of Panga's
 * logic that's exercised automatically; wire it into CI (see README).
 */
import assert from 'node:assert/strict';
import { isEligibleCandidate, rankCandidates, scoreCandidate, type MatchableProfile } from '../lib/matching';

function profile(overrides: Partial<MatchableProfile> & { userId: string }): MatchableProfile {
  return {
    gender: 'WOMAN',
    lookingFor: ['MAN'],
    city: 'Bengaluru',
    intent: 'SOMETHING_REAL',
    quietMode: false,
    circleIds: [],
    interestIds: [],
    lastActiveAt: new Date(),
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

console.log('lib/matching.ts — verification\n');

test('opposite-intent extremes are filtered out entirely', () => {
  const viewer = profile({ userId: 'v', gender: 'WOMAN', lookingFor: ['MAN'], intent: 'JUST_VIBING' });
  const candidate = profile({ userId: 'c', gender: 'MAN', lookingFor: ['WOMAN'], intent: 'RISHTA_READY' });
  assert.equal(isEligibleCandidate(viewer, candidate), false);
});

test('same intent + same city is eligible and scores intent + city weight', () => {
  const viewer = profile({ userId: 'v', gender: 'WOMAN', lookingFor: ['MAN'], intent: 'RISHTA_READY', city: 'Pune' });
  const candidate = profile({ userId: 'c', gender: 'MAN', lookingFor: ['WOMAN'], intent: 'RISHTA_READY', city: 'Pune' });
  assert.equal(isEligibleCandidate(viewer, candidate), true);
  const { score, reasons } = scoreCandidate(viewer, candidate);
  assert.ok(score >= 40 + 12, `expected score >= 52, got ${score}`);
  assert.ok(reasons.includes('same intent'));
  assert.ok(reasons.includes('same city'));
});

test('mutual gender preference is enforced both directions', () => {
  const viewer = profile({ userId: 'v', gender: 'WOMAN', lookingFor: ['WOMAN'] }); // viewer wants women
  const candidate = profile({ userId: 'c', gender: 'MAN', lookingFor: ['WOMAN'] }); // candidate is a man
  assert.equal(isEligibleCandidate(viewer, candidate), false);
});

test('different city but a shared circle is still eligible', () => {
  const viewer = profile({ userId: 'v', gender: 'WOMAN', lookingFor: ['MAN'], city: 'Pune', circleIds: ['iit-b-27'] });
  const candidate = profile({ userId: 'c', gender: 'MAN', lookingFor: ['WOMAN'], city: 'Delhi NCR', circleIds: ['iit-b-27'] });
  assert.equal(isEligibleCandidate(viewer, candidate), true);
});

test('no shared city and no shared circle is excluded', () => {
  const viewer = profile({ userId: 'v', gender: 'WOMAN', lookingFor: ['MAN'], city: 'Pune' });
  const candidate = profile({ userId: 'c', gender: 'MAN', lookingFor: ['WOMAN'], city: 'Delhi NCR' });
  assert.equal(isEligibleCandidate(viewer, candidate), false);
});

test('quiet mode profiles never appear', () => {
  const viewer = profile({ userId: 'v', gender: 'WOMAN', lookingFor: ['MAN'] });
  const candidate = profile({ userId: 'c', gender: 'MAN', lookingFor: ['WOMAN'], quietMode: true });
  assert.equal(isEligibleCandidate(viewer, candidate), false);
});

test('rankCandidates sorts best match first and respects exclusions', () => {
  const viewer = profile({ userId: 'v', gender: 'WOMAN', lookingFor: ['MAN'], city: 'Bengaluru', circleIds: ['music'], interestIds: ['trekking'] });
  const weak = profile({ userId: 'weak', gender: 'MAN', lookingFor: ['WOMAN'], city: 'Bengaluru' });
  const strong = profile({
    userId: 'strong',
    gender: 'MAN',
    lookingFor: ['WOMAN'],
    city: 'Bengaluru',
    circleIds: ['music'],
    interestIds: ['trekking'],
  });
  const excludedAlready = profile({ userId: 'excluded', gender: 'MAN', lookingFor: ['WOMAN'], city: 'Bengaluru' });

  const ranked = rankCandidates(viewer, [weak, strong, excludedAlready], new Set(['excluded']));
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0]?.userId, 'strong');
  assert.equal(ranked[1]?.userId, 'weak');
  assert.ok((ranked[0]?.score ?? 0) > (ranked[1]?.score ?? 0));
});

test('recency boosts a recently-active candidate over an identical stale one', () => {
  const viewer = profile({ userId: 'v', gender: 'WOMAN', lookingFor: ['MAN'], city: 'Chennai' });
  const fresh = profile({ userId: 'fresh', gender: 'MAN', lookingFor: ['WOMAN'], city: 'Chennai', lastActiveAt: new Date() });
  const stale = profile({
    userId: 'stale',
    gender: 'MAN',
    lookingFor: ['WOMAN'],
    city: 'Chennai',
    lastActiveAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  });
  const freshScore = scoreCandidate(viewer, fresh).score;
  const staleScore = scoreCandidate(viewer, stale).score;
  assert.ok(freshScore > staleScore, `expected fresh (${freshScore}) > stale (${staleScore})`);
});

console.log(`\n${passed}/${passed} checks passed.`);
