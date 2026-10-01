/**
 * Standalone correctness check for lib/matching.ts — no framework, no DB,
 * runnable with plain `tsx` or `ts-node`. This is the one piece of findmyVybe's
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

test('different city is excluded -- same city is the only "real path to meet" signal left now that circles are gone', () => {
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
  const viewer = profile({ userId: 'v', gender: 'WOMAN', lookingFor: ['MAN'], city: 'Bengaluru', interestIds: ['trekking', 'coffee'] });
  const weak = profile({ userId: 'weak', gender: 'MAN', lookingFor: ['WOMAN'], city: 'Bengaluru' });
  const strong = profile({
    userId: 'strong',
    gender: 'MAN',
    lookingFor: ['WOMAN'],
    city: 'Bengaluru',
    interestIds: ['trekking', 'coffee'],
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

// --- Intent-aware location rules (Just Vibing: distance-only; Something
// Real / Rishta Ready: city OR distance) -- see DISTANCE_RADIUS_KM in
// lib/matching.ts for the rules themselves. Bengaluru-area coordinates used
// throughout so "same city, but far apart" is realistic (the metro spans
// tens of km corner to corner).
const BLR_CENTRAL = { latitude: 12.9716, longitude: 77.5946 }; // MG Road-ish
const BLR_NEARBY = { latitude: 12.9698, longitude: 77.75 }; // ~17km away -- Whitefield-ish, still well inside Just Vibing's 25km radius
const BLR_FAR = { latitude: 13.2, longitude: 77.75 }; // ~35km away -- same city string, outside Just Vibing's 25km radius
const PUNE_CENTRAL = { latitude: 18.5204, longitude: 73.8567 }; // ~840km from Bengaluru -- outside even the 50km Something Real/Rishta Ready radius

test('Just Vibing: same city but far apart (>25km) is ineligible -- distance, not the city string, is the rule', () => {
  const viewer = profile({ userId: 'v', gender: 'WOMAN', lookingFor: ['MAN'], intent: 'JUST_VIBING', city: 'Bengaluru', ...BLR_CENTRAL });
  const farSameCity = profile({ userId: 'far', gender: 'MAN', lookingFor: ['WOMAN'], intent: 'JUST_VIBING', city: 'Bengaluru', ...BLR_FAR });
  assert.equal(isEligibleCandidate(viewer, farSameCity), false);
});

test('Just Vibing: close by (within 25km) is eligible even without the old city-only path being the reason', () => {
  const viewer = profile({ userId: 'v', gender: 'WOMAN', lookingFor: ['MAN'], intent: 'JUST_VIBING', city: 'Bengaluru', ...BLR_CENTRAL });
  const nearby = profile({ userId: 'near', gender: 'MAN', lookingFor: ['WOMAN'], intent: 'JUST_VIBING', city: 'Bengaluru', ...BLR_NEARBY });
  assert.equal(isEligibleCandidate(viewer, nearby), true);
});

test('Just Vibing: no resolvable coordinates on either side is ineligible (fails safe, never silently "everyone")', () => {
  const viewer = profile({ userId: 'v', gender: 'WOMAN', lookingFor: ['MAN'], intent: 'JUST_VIBING', city: 'Bengaluru' });
  const candidate = profile({ userId: 'c', gender: 'MAN', lookingFor: ['WOMAN'], intent: 'JUST_VIBING', city: 'Bengaluru' });
  assert.equal(isEligibleCandidate(viewer, candidate), false);
});

test('Just Vibing: closer candidate ranks above a farther one (the actual "closer the better" request)', () => {
  const viewer = profile({ userId: 'v', gender: 'WOMAN', lookingFor: ['MAN'], intent: 'JUST_VIBING', city: 'Bengaluru', ...BLR_CENTRAL });
  const closer = profile({ userId: 'closer', gender: 'MAN', lookingFor: ['WOMAN'], intent: 'JUST_VIBING', city: 'Bengaluru', latitude: 12.9716, longitude: 77.6 });
  const farther = profile({ userId: 'farther', gender: 'MAN', lookingFor: ['WOMAN'], intent: 'JUST_VIBING', city: 'Bengaluru', ...BLR_NEARBY });
  const closerScore = scoreCandidate(viewer, closer).score;
  const fartherScore = scoreCandidate(viewer, farther).score;
  assert.ok(closerScore > fartherScore, `expected closer (${closerScore}) > farther (${fartherScore})`);
});

test('Something Real: different city is eligible when within the 50km radius (the new OR-distance path)', () => {
  const viewer = profile({ userId: 'v', gender: 'WOMAN', lookingFor: ['MAN'], intent: 'SOMETHING_REAL', city: 'Bengaluru', ...BLR_CENTRAL });
  const nearbyDifferentCityLabel = profile({
    userId: 'c',
    gender: 'MAN',
    lookingFor: ['WOMAN'],
    intent: 'SOMETHING_REAL',
    city: 'Mysuru', // not one of findmyVybe's supported CITIES, but matching.ts's eligibility rule is intentionally city-list-agnostic
    ...BLR_NEARBY,
  });
  assert.equal(isEligibleCandidate(viewer, nearbyDifferentCityLabel), true);
});

test('Something Real: same city is still sufficient on its own, with no coordinates at all (unchanged from before this feature)', () => {
  const viewer = profile({ userId: 'v', gender: 'WOMAN', lookingFor: ['MAN'], intent: 'SOMETHING_REAL', city: 'Pune' });
  const candidate = profile({ userId: 'c', gender: 'MAN', lookingFor: ['WOMAN'], intent: 'SOMETHING_REAL', city: 'Pune' });
  assert.equal(isEligibleCandidate(viewer, candidate), true);
});

test('Something Real: different city AND beyond the radius is still ineligible', () => {
  const viewer = profile({ userId: 'v', gender: 'WOMAN', lookingFor: ['MAN'], intent: 'SOMETHING_REAL', city: 'Bengaluru', ...BLR_CENTRAL });
  const faraway = profile({ userId: 'c', gender: 'MAN', lookingFor: ['WOMAN'], intent: 'SOMETHING_REAL', city: 'Pune', ...PUNE_CENTRAL });
  assert.equal(isEligibleCandidate(viewer, faraway), false);
});

test('Rishta Ready: same OR-distance rule as Something Real', () => {
  const viewer = profile({ userId: 'v', gender: 'WOMAN', lookingFor: ['MAN'], intent: 'RISHTA_READY', city: 'Bengaluru', ...BLR_CENTRAL });
  const nearbyDifferentCityLabel = profile({
    userId: 'c',
    gender: 'MAN',
    lookingFor: ['WOMAN'],
    intent: 'RISHTA_READY',
    city: 'Mysuru',
    ...BLR_NEARBY,
  });
  const faraway = profile({ userId: 'far', gender: 'MAN', lookingFor: ['WOMAN'], intent: 'RISHTA_READY', city: 'Pune', ...PUNE_CENTRAL });
  assert.equal(isEligibleCandidate(viewer, nearbyDifferentCityLabel), true);
  assert.equal(isEligibleCandidate(viewer, faraway), false);
});

console.log(`\n${passed}/${passed} checks passed.`);
