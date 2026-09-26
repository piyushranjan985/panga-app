import crypto from 'crypto';
import { db } from '@/lib/db';

/**
 * Duplicate-identity detection (docs/IDENTITY_VERIFICATION_AND_SAFETY.md
 * section 7: "one government ID should not be able to back more than one
 * account"). We never store a raw Aadhaar/DL number anywhere -- only an
 * HMAC-SHA256 of it, keyed by a server-only secret (DUPLICATE_CHECK_PEPPER,
 * never checked into git, never sent to the client). HMAC rather than a
 * plain hash specifically so the value isn't guessable/brute-forceable
 * from a leaked hash the way an unsalted SHA256 of a 12-digit Aadhaar
 * number would be (small keyspace).
 *
 * IdentityVerification.documentHash has a DB-level @unique constraint, so
 * a duplicate is caught even if a future code path forgets to call
 * checkDuplicateIdentity() first -- this module is the one place that
 * DOES call it proactively, before touching the DB, so the caller gets a
 * clean "already used" answer instead of a raw Postgres unique-violation
 * error to handle.
 */

function getPepper(): string {
  const pepper = process.env.DUPLICATE_CHECK_PEPPER;
  if (!pepper) {
    // Fail loudly rather than hashing with an empty/undefined key, which
    // would make every deployment's hashes guessable against each other.
    throw new Error(
      '[duplicateIdentity] DUPLICATE_CHECK_PEPPER is not set -- see .env.example. Refusing to hash identity documents with no secret.',
    );
  }
  return pepper;
}

/**
 * Normalizes a document reference before hashing (trim, uppercase,
 * collapse whitespace) so cosmetic differences ("1234 5678 9012" vs
 * "123456789012") don't produce different hashes for the same document.
 */
export function hashDocumentReference(documentType: string, reference: string): string {
  const normalized = `${documentType}:${reference.trim().toUpperCase().replace(/\s+/g, '')}`;
  return crypto.createHmac('sha256', getPepper()).update(normalized).digest('hex');
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingUserId?: string;
}

/**
 * Looks for another account already verified against the same document
 * hash. `excludeUserId` lets a user re-verify (retry after a REJECTED
 * attempt, or re-verify on expiry) without tripping over their own prior
 * record.
 */
export async function checkDuplicateIdentity(
  documentHash: string,
  excludeUserId: string,
): Promise<DuplicateCheckResult> {
  const existing = await db.identityVerification.findFirst({
    where: {
      documentHash,
      userId: { not: excludeUserId },
      status: { in: ['VERIFIED', 'MANUAL_REVIEW', 'PENDING'] },
    },
    select: { userId: true },
  });
  if (!existing) return { isDuplicate: false };
  return { isDuplicate: true, existingUserId: existing.userId };
}
