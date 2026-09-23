import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, isPasswordStrongEnough } from '../lib/password';

describe('lib/password -- admin credential handling', () => {
  test('a hashed password verifies against its own plaintext', async () => {
    const hash = await hashPassword('a-strong-temporary-password-1');
    assert.equal(await verifyPassword('a-strong-temporary-password-1', hash), true);
  });

  test('a hashed password rejects the wrong plaintext', async () => {
    const hash = await hashPassword('a-strong-temporary-password-1');
    assert.equal(await verifyPassword('totally-different-password', hash), false);
  });

  test('two hashes of the same password are not identical (salted)', async () => {
    const hashA = await hashPassword('same-password-value-12345');
    const hashB = await hashPassword('same-password-value-12345');
    assert.notEqual(hashA, hashB);
  });

  test('isPasswordStrongEnough enforces the 12-character minimum', () => {
    assert.equal(isPasswordStrongEnough('short'), false);
    assert.equal(isPasswordStrongEnough('elevenchars'), false); // 11 chars
    assert.equal(isPasswordStrongEnough('twelvecharss'), true); // 12 chars
    assert.equal(isPasswordStrongEnough('a'.repeat(40)), true);
  });
});
