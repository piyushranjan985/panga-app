import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ageFromDateOfBirth } from '../lib/age';
import { parseSearchQuery } from '../lib/searchQueryParser';

// Deliberately NOT importing lib/searchBehaviorBoost.ts here -- it pulls
// in lib/db.ts (a real Prisma client against DATABASE_URL), same reason
// tests/otpRateLimit.test.ts only exercises lib/otpRateLimit.ts and not
// lib/otp.ts. lib/age.ts and lib/searchQueryParser.ts are written
// specifically to have zero such dependencies.

describe('lib/age -- ageFromDateOfBirth', () => {
  test('birthday already happened this year', () => {
    assert.equal(ageFromDateOfBirth(new Date('2000-01-15'), new Date('2026-09-10')), 26);
  });

  test('birthday has not happened yet this year', () => {
    assert.equal(ageFromDateOfBirth(new Date('2000-12-25'), new Date('2026-09-10')), 25);
  });

  test('birthday is exactly today counts as already had it', () => {
    assert.equal(ageFromDateOfBirth(new Date('2000-09-10'), new Date('2026-09-10')), 26);
  });
});

const TAXONOMY = {
  interests: [
    { id: 'i-travel', label: 'Travel' },
    { id: 'i-foodie', label: 'Foodie' },
    { id: 'i-live-music', label: 'Live Music' },
  ],
  tribes: [
    { id: 't-gamers', label: 'Gamers' },
    { id: 't-bookworms', label: 'Bookworms' },
  ],
};

describe('lib/searchQueryParser -- parseSearchQuery', () => {
  test('empty/blank text parses to an empty result', () => {
    const r = parseSearchQuery('  ', TAXONOMY);
    assert.deepEqual(r, { interestIds: [], tribeIds: [] });
  });

  test('explicit age range with "to"', () => {
    const r = parseSearchQuery('girls 24 to 29', TAXONOMY);
    assert.equal(r.ageMin, 24);
    assert.equal(r.ageMax, 29);
    assert.equal(r.gender, 'WOMAN');
  });

  test('"between X and Y" phrasing', () => {
    const r = parseSearchQuery('boys between 25 and 30', TAXONOMY);
    assert.equal(r.ageMin, 25);
    assert.equal(r.ageMax, 30);
    assert.equal(r.gender, 'MAN');
  });

  test('distance is extracted and does not get swallowed by the age regex', () => {
    const r = parseSearchQuery('women 24-29 within 10km', TAXONOMY);
    assert.equal(r.distanceKm, 10);
    assert.equal(r.ageMin, 24);
    assert.equal(r.ageMax, 29);
  });

  test('"under N" sets only ageMax', () => {
    const r = parseSearchQuery('under 30', TAXONOMY);
    assert.equal(r.ageMax, 29);
    assert.equal(r.ageMin, undefined);
  });

  test('"over N" sets only ageMin', () => {
    const r = parseSearchQuery('over 25', TAXONOMY);
    assert.equal(r.ageMin, 26);
    assert.equal(r.ageMax, undefined);
  });

  test('intent keywords map to the right IntentType', () => {
    assert.equal(parseSearchQuery('just vibing with someone', TAXONOMY).intent, 'JUST_VIBING');
    assert.equal(parseSearchQuery('looking for something real', TAXONOMY).intent, 'SOMETHING_REAL');
    assert.equal(parseSearchQuery('rishta ready only', TAXONOMY).intent, 'RISHTA_READY');
  });

  test('interest and tribe labels are matched case-insensitively, longest first', () => {
    const r = parseSearchQuery('someone who loves live music and travel, into gaming with gamers', TAXONOMY);
    assert.ok(r.interestIds.includes('i-live-music'));
    assert.ok(r.interestIds.includes('i-travel'));
    assert.ok(r.tribeIds.includes('t-gamers'));
  });

  test('a realistic combined query parses every field at once', () => {
    const r = parseSearchQuery('women 25-30 within 15km into foodie and bookworms, something real', TAXONOMY);
    assert.equal(r.gender, 'WOMAN');
    assert.equal(r.ageMin, 25);
    assert.equal(r.ageMax, 30);
    assert.equal(r.distanceKm, 15);
    assert.equal(r.intent, 'SOMETHING_REAL');
    assert.ok(r.interestIds.includes('i-foodie'));
    assert.ok(r.tribeIds.includes('t-bookworms'));
  });
});
