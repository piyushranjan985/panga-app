import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { maskEmail, maskPhone, ageFromDob } from '../lib/mask';

describe('lib/mask -- PII masking (the only place these values get formatted for display)', () => {
  test('maskEmail keeps one leading character and the full domain', () => {
    assert.equal(maskEmail('priya@example.com'), 'p••••@example.com');
  });

  test('maskEmail handles null', () => {
    assert.equal(maskEmail(null), '—');
  });

  test('maskEmail never leaks the local part beyond its first character', () => {
    const masked = maskEmail('averylongusername@example.com');
    assert.ok(!masked.startsWith('averylongusername'));
    assert.match(masked, /^a•+@example\.com$/);
  });

  test('maskPhone keeps only the last two digits', () => {
    const masked = maskPhone('+919876543210');
    assert.ok(masked.endsWith('10'));
    assert.ok(!masked.includes('98765432'));
  });

  test('maskPhone handles null', () => {
    assert.equal(maskPhone(null), '—');
  });

  test('ageFromDob is exact when today is the birthday', () => {
    const now = new Date();
    const dob = new Date(now.getFullYear() - 30, now.getMonth(), now.getDate());
    assert.equal(ageFromDob(dob), 30);
  });

  // A same-day-next-year probe: exactly one year older than the
  // birthday-today case, still exact (m === 0 branch), and independent of
  // which calendar day the suite happens to run on -- avoids the
  // flakiness a naive "tomorrow" construction would hit specifically when
  // today is Dec 31 and "tomorrow" rolls into a new calendar year.
  test('ageFromDob is exact one full year before/after a birthday-today baseline', () => {
    const now = new Date();
    const dobOneYearOlder = new Date(now.getFullYear() - 31, now.getMonth(), now.getDate());
    const dobOneYearYounger = new Date(now.getFullYear() - 29, now.getMonth(), now.getDate());
    assert.equal(ageFromDob(dobOneYearOlder), 31);
    assert.equal(ageFromDob(dobOneYearYounger), 29);
  });
});
