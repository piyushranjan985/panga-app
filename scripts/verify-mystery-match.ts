/**
 * Standalone correctness check for lib/mysteryMatch.ts — no framework, no
 * DB, runnable with plain `tsx`. Same spirit as scripts/verify-matching.ts.
 */
import assert from 'node:assert/strict';
import { matchMysteryPool, nextRotationCategory, type MysteryCandidate } from '../lib/mysteryMatch';

function candidate(overrides: Partial<MysteryCandidate> & { userId: string }): MysteryCandidate {
  return {
    gender: 'WOMAN',
    lookingFor: ['MAN'],
    city: 'Bengaluru',
    intent: 'SOMETHING_REAL',
    interestIds: [],
    tribeIds: [],
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

console.log('lib/mysteryMatch.ts — verification\n');

test('Mystery Match requires same intent and same city', () => {
  const a = candidate({ userId: 'a', gender: 'WOMAN', lookingFor: ['MAN'], intent: 'SOMETHING_REAL', city: 'Pune' });
  const b = candidate({ userId: 'b', gender: 'MAN', lookingFor: ['WOMAN'], intent: 'RISHTA_READY', city: 'Pune' });
  const c = candidate({ userId: 'c', gender: 'MAN', lookingFor: ['WOMAN'], intent: 'SOMETHING_REAL', city: 'Mumbai' });
  assert.deepEqual(matchMysteryPool('MYSTERY_MATCH', [a, b], new Set()), []); // different intent
  assert.deepEqual(matchMysteryPool('MYSTERY_MATCH', [a, c], new Set()), []); // different city
});

test('Vybe Flip prefers the LOWEST-overlap pair, not the highest', () => {
  const viewer = candidate({ userId: 'v', gender: 'WOMAN', lookingFor: ['MAN'], interestIds: ['hiking', 'coffee'] });
  const similar = candidate({ userId: 's', gender: 'MAN', lookingFor: ['WOMAN'], interestIds: ['hiking', 'coffee'] });
  const opposite = candidate({ userId: 'o', gender: 'MAN', lookingFor: ['WOMAN'], interestIds: ['gaming'] });
  const pairs = matchMysteryPool('VYBE_FLIP', [viewer, similar, opposite], new Set());
  assert.equal(pairs.length, 1);
  assert.deepEqual(new Set([pairs[0]!.userIdA, pairs[0]!.userIdB]), new Set(['v', 'o']));
});

test('No-Labels Match requires DIFFERENT intent, any pair of the 3', () => {
  const jv = candidate({ userId: 'jv', gender: 'WOMAN', lookingFor: ['MAN'], intent: 'JUST_VIBING' });
  const rr = candidate({ userId: 'rr', gender: 'MAN', lookingFor: ['WOMAN'], intent: 'RISHTA_READY' });
  const jv2 = candidate({ userId: 'jv2', gender: 'MAN', lookingFor: ['WOMAN'], intent: 'JUST_VIBING' });
  // jv + rr: different intent -> eligible. jv + jv2: same intent -> not eligible for No-Labels.
  const pairs = matchMysteryPool('NO_LABELS', [jv, rr, jv2], new Set());
  assert.equal(pairs.length, 1);
  assert.deepEqual(new Set([pairs[0]!.userIdA, pairs[0]!.userIdB]), new Set(['jv', 'rr']));
});

test('a pair in excludePairs is never suggested, regardless of fit', () => {
  const a = candidate({ userId: 'a', gender: 'WOMAN', lookingFor: ['MAN'] });
  const b = candidate({ userId: 'b', gender: 'MAN', lookingFor: ['WOMAN'] });
  const pairs = matchMysteryPool('MYSTERY_MATCH', [a, b], new Set(['a:b']));
  assert.deepEqual(pairs, []);
});

test('mutual gender preference is required in both directions', () => {
  const a = candidate({ userId: 'a', gender: 'WOMAN', lookingFor: ['WOMAN'] }); // only wants women
  const b = candidate({ userId: 'b', gender: 'MAN', lookingFor: ['WOMAN'] }); // wants women, but a doesn't want men
  assert.deepEqual(matchMysteryPool('MYSTERY_MATCH', [a, b], new Set()), []);
});

test('a pool of 4 eligible people produces 2 disjoint pairs, nobody reused', () => {
  const pool = [
    candidate({ userId: 'a', gender: 'WOMAN', lookingFor: ['MAN'] }),
    candidate({ userId: 'b', gender: 'MAN', lookingFor: ['WOMAN'] }),
    candidate({ userId: 'c', gender: 'WOMAN', lookingFor: ['MAN'] }),
    candidate({ userId: 'd', gender: 'MAN', lookingFor: ['WOMAN'] }),
  ];
  const pairs = matchMysteryPool('MYSTERY_MATCH', pool, new Set());
  assert.equal(pairs.length, 2);
  const used = pairs.flatMap((p) => [p.userIdA, p.userIdB]);
  assert.equal(new Set(used).size, 4); // nobody appears twice
});

test('7-day rotation cycles MYSTERY_MATCH -> VYBE_FLIP -> NO_LABELS -> MYSTERY_MATCH, never OPTED_OUT', () => {
  assert.equal(nextRotationCategory('MYSTERY_MATCH'), 'VYBE_FLIP');
  assert.equal(nextRotationCategory('VYBE_FLIP'), 'NO_LABELS');
  assert.equal(nextRotationCategory('NO_LABELS'), 'MYSTERY_MATCH');
});

console.log(`\n${passed} checks passed.`);
