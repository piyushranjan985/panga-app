/**
 * Standalone correctness check for lib/matching.ts — no framework, no DB,
 * runnable with plain `tsx` or `ts-node`. This is the one piece of findmyVybe's
 * logic that's exercised automatically; wire it into CI (see README).
 */
import assert from 'node:assert/strict';
import { isEligibleCandidate, rankCandidates, scoreCandidate, type MatchableProfile } from '../lib/matching';

// Default dateOfBirth makes every existing test's candidate exactly 30
// years old as of "now" -- well inside the default 18-99 ageMin/ageMax
// below, so none of the tests written before age scoring existed need to
// care about it unless they override one of these three fields directly.
function defaultDateOfBirth(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 30);
  return d;
}

function ageYearsAgo(years: number): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
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
    ageMin: 18,
    ageMax: 99,
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

test('age is a soft signal, not eligibility -- a candidate outside the viewer\'s preferred range still appears', () => {
  const viewer = profile({ userId: 'v', gender: 'WOMAN', lookingFor: ['MAN'], city: 'Pune', ageMin: 25, ageMax: 30 });
  const tooOld = profile({ userId: 'c', gender: 'MAN', lookingFor: ['WOMAN'], city: 'Pune', dateOfBirth: ageYearsAgo(45) });
  assert.equal(isEligibleCandidate(viewer, tooOld), true);
});

test('a candidate inside the viewer\'s preferred range scores higher than one outside it, all else equal', () => {
  const viewer = profile({ userId: 'v', gender: 'WOMAN', lookingFor: ['MAN'], city: 'Pune', ageMin: 25, ageMax: 30 });
  const inRange = profile({ userId: 'in', gender: 'MAN', lookingFor: ['WOMAN'], city: 'Pune', dateOfBirth: ageYearsAgo(27) });
  const farOutside = profile({ userId: 'out', gender: 'MAN', lookingFor: ['WOMAN'], city: 'Pune', dateOfBirth: ageYearsAgo(55) });
  const inScore = scoreCandidate(viewer, inRange).score;
  const outScore = scoreCandidate(viewer, farOutside).score;
  assert.ok(inScore > outScore, `expected in-range (${inScore}) > far-outside (${outScore})`);
});

test('age scoring is one-sided: the CANDIDATE\'s own narrow range never affects how the VIEWER is scored', () => {
  // viewer is 50 and wide-open; candidate is 25 and has narrowed their own
  // range to 20-24 (i.e. they wouldn't want to see the viewer) -- that
  // must not change this score at all, since this call is scoring the
  // candidate from the VIEWER's point of view, using only the viewer's
  // own ageMin/ageMax.
  const viewer = profile({ userId: 'v', gender: 'WOMAN', lookingFor: ['MAN'], city: 'Pune', dateOfBirth: ageYearsAgo(50), ageMin: 18, ageMax: 99 });
  const candidateNarrow = profile({ userId: 'c1', gender: 'MAN', lookingFor: ['WOMAN'], city: 'Pune', dateOfBirth: ageYearsAgo(25), ageMin: 20, ageMax: 24 });
  const candidateWide = profile({ userId: 'c2', gender: 'MAN', lookingFor: ['WOMAN'], city: 'Pune', dateOfBirth: ageYearsAgo(25), ageMin: 18, ageMax: 99 });
  assert.equal(scoreCandidate(viewer, candidateNarrow).score, scoreCandidate(viewer, candidateWide).score);
});

test('a candidate exactly on the preferred-range boundary gets the full age bonus and the reason text', () => {
  const viewer = profile({ userId: 'v', gender: 'WOMAN', lookingFor: ['MAN'], city: 'Pune', ageMin: 25, ageMax: 30 });
  const onBoundary = profile({ userId: 'c', gender: 'MAN', lookingFor: ['WOMAN'], city: 'Pune', dateOfBirth: ageYearsAgo(30) });
  const { reasons } = scoreCandidate(viewer, onBoundary);
  assert.ok(reasons.includes('in your preferred age range'));
});

test('a viewer who never narrowed their default 18-99 range never gets the age reason, even for an exact-fit candidate', () => {
  const viewer = profile({ userId: 'v', gender: 'WOMAN', lookingFor: ['MAN'], city: 'Pune' }); // default 18-99
  const candidate = profile({ userId: 'c', gender: 'MAN', lookingFor: ['WOMAN'], city: 'Pune', dateOfBirth: ageYearsAgo(27) });
  const { reasons } = scoreCandidate(viewer, candidate);
  assert.ok(!reasons.includes('in your preferred age range'));
});

console.log(`\n${passed}/${passed} checks passed.`);
