import bcrypt from 'bcryptjs';

// Cost factor 12 -- deliberately higher than a typical consumer signup
// flow (the root app has no password login at all, so there's no existing
// convention to match) since these credentials guard PII/enforcement
// actions for the whole user base, not one person's own account.
const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Minimum bar enforced on admin creation/password reset -- see
// app/api/admin-users/route.ts. Deliberately more than "8 characters" for
// accounts that can ban users, approve deletions, and read PII.
export function isPasswordStrongEnough(plain: string): boolean {
  return plain.length >= 12;
}
