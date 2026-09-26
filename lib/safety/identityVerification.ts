import { SignJWT, jwtVerify } from 'jose';
import { db } from '@/lib/db';
import { hashDocumentReference, checkDuplicateIdentity } from './duplicateIdentity';

/**
 * DigiLocker (India's government-run digital document locker, run under
 * the Ministry of Electronics & IT via the API Setu partner program)
 * identity verification -- docs/IDENTITY_VERIFICATION_AND_SAFETY.md
 * section 2.
 *
 * SCOPE NOTE (2026-09-26): no selfie capture, no liveness check, no
 * face-match step. This module confirms four things about the document,
 * and nothing about whether the account's photos show the same person:
 *   1. it holds a government-issued document (Aadhaar or Driving Licence),
 *   2. that document's OWN date of birth puts them at 18 or older --
 *      checked against the document's DOB directly, not the profile's
 *      self-reported one, since that's the value actually being verified,
 *   3. that DOB is consistent with what they entered at onboarding,
 *   4. the document's name shares at least one word with their profile
 *      display name (see namesShareAToken() below).
 * It does NOT confirm "the person in this document is the person using
 * this account" -- that would need a selfie + face-match step, which was
 * a deliberate, explicit product decision to descope; see the same note
 * in lib/safety/policyEngine.ts for the consequence.
 *
 * REAL CREDENTIALS: getting production DigiLocker OAuth credentials
 * (DIGILOCKER_CLIENT_ID / DIGILOCKER_CLIENT_SECRET) requires findmyVybe's
 * own organization to register and pass KYC/approval on the API Setu
 * Partners portal (apisetu.gov.in) -- a manual, calendar-time process,
 * not something that can be done from code. Until DIGILOCKER_CLIENT_ID is
 * set, VERIFICATION_PROVIDER should stay "mock" (the default) so the rest
 * of the app is fully testable end-to-end. The moment real credentials
 * exist, flip VERIFICATION_PROVIDER=digilocker and set the DIGILOCKER_*
 * vars in .env -- no other code changes needed.
 *
 * ENDPOINT CAVEAT: the authorize/token URLs below default to DigiLocker's
 * publicly documented OAuth endpoints, and the document-fetch call below
 * is written against the general shape of API Setu's REST document-pull
 * API. The *exact* document-pull path and response shape are assigned
 * per-partner in the approval packet the user's organization receives
 * from API Setu -- this can't be verified against real credentials from
 * here. Treat fetchDigilockerIdentityDocument()'s HTTP calls as the one
 * part of this file that will likely need a small adjustment once real
 * credentials and partner docs are in hand; everything around it
 * (state signing, duplicate check, DOB check, DB writes) does not change.
 */

export type VerificationProviderName = 'mock' | 'digilocker';

export function getVerificationProviderName(): VerificationProviderName {
  return process.env.VERIFICATION_PROVIDER === 'digilocker' ? 'digilocker' : 'mock';
}

export function isDigilockerConfigured(): boolean {
  return Boolean(process.env.DIGILOCKER_CLIENT_ID && process.env.DIGILOCKER_CLIENT_SECRET);
}

// --- OAuth state token -------------------------------------------------
// A short-lived, signed JWT carried through the DigiLocker redirect round
// trip as the OAuth2 `state` parameter -- standard CSRF protection so the
// callback can't be replayed against a different user's session, and so
// we know which of our users the callback is for even if the session
// cookie doesn't survive the redirect for some browser/environment reason.
// Reuses SESSION_JWT_SECRET (already a required env var) rather than
// adding a new secret -- distinguished by its own `aud` claim so it can
// never be confused with a real session cookie.

const STATE_SECRET = new TextEncoder().encode(
  process.env.SESSION_JWT_SECRET || 'dev-only-change-me-please-generate-a-real-secret',
);
const STATE_TTL_SECONDS = 60 * 10; // 10 minutes -- generous for a slow OTP/consent screen, short enough to limit replay risk

export async function signVerificationState(userId: string): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience('digilocker_state')
    .setIssuedAt()
    .setExpirationTime(`${STATE_TTL_SECONDS}s`)
    .sign(STATE_SECRET);
}

export async function verifyVerificationState(token: string): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, STATE_SECRET, { audience: 'digilocker_state' });
    if (typeof payload.userId !== 'string') return null;
    return { userId: payload.userId };
  } catch {
    return null;
  }
}

// --- DigiLocker OAuth2 --------------------------------------------------

function redirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}/api/verification/callback`;
}

export function buildDigilockerAuthorizationUrl(state: string): string {
  const authorizeUrl = process.env.DIGILOCKER_AUTHORIZE_URL || 'https://digilocker.meripehchaan.gov.in/public/oauth2/1/authorize';
  const url = new URL(authorizeUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', process.env.DIGILOCKER_CLIENT_ID || '');
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('state', state);
  return url.toString();
}

interface DigilockerTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

async function exchangeDigilockerCode(code: string): Promise<string> {
  const tokenUrl = process.env.DIGILOCKER_TOKEN_URL || 'https://digilocker.meripehchaan.gov.in/public/oauth2/1/token';
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: process.env.DIGILOCKER_CLIENT_ID || '',
    client_secret: process.env.DIGILOCKER_CLIENT_SECRET || '',
    redirect_uri: redirectUri(),
  });
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error(`DigiLocker token exchange failed (${res.status}): ${await res.text().catch(() => '')}`);
  }
  const json = (await res.json()) as DigilockerTokenResponse;
  return json.access_token;
}

export interface FetchedIdentityDocument {
  documentType: string; // "AADHAAR" | "DRIVING_LICENCE" | ...
  referenceForHash: string; // full reference, only ever hashed, never stored raw
  referenceMasked: string; // e.g. "XXXX XXXX 9012" -- safe to store/display
  dateOfBirth: Date | null;
  name: string | null;
  providerReference: string; // DigiLocker's own transaction/request id, support & audit only
}

/**
 * See the ENDPOINT CAVEAT in this file's top comment -- the exact path
 * and field names are partner-specific and assigned by API Setu on
 * approval. This calls a generic "issued documents" pull, on the
 * assumption (true for both eAadhaar and Driving Licence, the two
 * documents this app accepts) that the response includes the holder's
 * DOB and a masked document number. Adjust the path/field mapping against
 * the real API Setu partner docs once they exist.
 */
async function fetchDigilockerIdentityDocument(accessToken: string): Promise<FetchedIdentityDocument> {
  const apiBase = process.env.DIGILOCKER_API_BASE || 'https://digilocker.meripehchaan.gov.in/public/oauth2/3';
  const res = await fetch(`${apiBase}/xml/eaadhaar`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`DigiLocker document fetch failed (${res.status}): ${await res.text().catch(() => '')}`);
  }
  const json = await res.json();

  const dobRaw: string | undefined = json.dob ?? json.dateOfBirth ?? json.DOB;
  const dateOfBirth = dobRaw ? parseDigilockerDate(dobRaw) : null;
  const reference: string = json.uid ?? json.aadhaarNumber ?? json.docNumber ?? '';

  return {
    documentType: 'AADHAAR',
    referenceForHash: reference,
    referenceMasked: maskReference(reference),
    dateOfBirth,
    name: json.name ?? null,
    providerReference: json.transactionId ?? json.txnId ?? crypto.randomUUID(),
  };
}

function parseDigilockerDate(raw: string): Date | null {
  // DigiLocker commonly returns DD-MM-YYYY; also accept ISO as a fallback.
  const ddmmyyyy = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    return new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function maskReference(reference: string): string {
  if (reference.length <= 4) return '••••';
  return `${'•'.repeat(reference.length - 4)}${reference.slice(-4)}`;
}

// --- Mock provider -------------------------------------------------------
// Mirrors the existing VERIFICATION_PROVIDER=mock convention. Deliberately
// supports a `scenario` override (via a query param the UI/tester can
// pass) so the full state machine -- VERIFIED, MANUAL_REVIEW (DOB
// mismatch), REJECTED (duplicate identity) -- can be exercised without
// ever touching real DigiLocker.

export type MockScenario = 'match' | 'dob_mismatch' | 'duplicate' | 'underage' | 'name_mismatch';

export async function mockFetchIdentityDocument(
  userId: string,
  scenario: MockScenario = 'match',
): Promise<FetchedIdentityDocument> {
  const profile = await db.profile.findUnique({ where: { userId }, select: { dateOfBirth: true, displayName: true } });

  // A stable per-user reference by default, so re-running the mock flow
  // for the same user doesn't spuriously trip duplicate detection against
  // itself (checkDuplicateIdentity already excludes the user's own prior
  // rows, but this keeps behavior obviously sane either way). The
  // "duplicate" scenario deliberately reuses a fixed reference shared by
  // every account that requests it, so two different test accounts can
  // reproduce a real duplicate-identity collision on demand.
  const reference = scenario === 'duplicate' ? 'MOCK-SHARED-DUPLICATE-0001' : `MOCK-${userId}`;

  const dateOfBirth =
    scenario === 'dob_mismatch'
      ? new Date('1990-01-01T00:00:00.000Z') // deliberately wrong (but still an adult), to exercise the mismatch path in isolation
      : scenario === 'underage'
        ? new Date(`${new Date().getUTCFullYear() - 10}-01-01T00:00:00.000Z`) // a stable 10-year-old, today
        : profile?.dateOfBirth ?? new Date('2000-01-01T00:00:00.000Z');

  const name =
    scenario === 'name_mismatch'
      ? 'Someone Else Entirely' // deliberately shares no token with any real profile name
      : profile?.displayName ?? null; // "match" (and everything else): a document name consistent with the profile, so only the scenario under test triggers

  return {
    documentType: 'AADHAAR',
    referenceForHash: reference,
    referenceMasked: maskReference(reference),
    dateOfBirth,
    name,
    providerReference: `mock-${Date.now()}`,
  };
}

// --- Shared decision logic -----------------------------------------------

export type AgeStatus = 'adult' | 'minor' | 'unknown';

export interface VerificationDecision {
  status: 'VERIFIED' | 'MANUAL_REVIEW' | 'REJECTED';
  failureReason?: string;
  dobMatchedProfile: boolean;
  isDuplicate: boolean;
  ageStatus: AgeStatus;
  nameMatchesProfile: boolean | null; // null = document had no name to compare, not treated as a mismatch
}

/**
 * Same decision rule regardless of provider (mock or real DigiLocker),
 * checked in this order -- most severe/certain signal first:
 *
 *   1. document reference already backs a different account -> REJECTED
 *      (a shared-secret government ID number behind two accounts is a
 *      strong, specific fraud signal -- not sent to manual review).
 *   2. the DOCUMENT's own DOB (never the profile's self-reported one --
 *      that's exactly the value being verified against) says under 18 ->
 *      REJECTED. This is a hard, non-negotiable safety stop, unlike every
 *      other check here: there is no "human might have a good reason to
 *      overrule this" case for letting a confirmed minor onto a dating
 *      platform, so this is the one place a REJECTED here is final
 *      (see docs/IDENTITY_VERIFICATION_AND_SAFETY.md section 6/7).
 *   3. the document's DOB couldn't be parsed at all -> MANUAL_REVIEW.
 *      Distinct from "confirmed minor" -- this is "we don't know," and an
 *      unconfirmed age is not the same claim as a confirmed one.
 *   4. DOB from the document doesn't match what the user entered at
 *      onboarding -> MANUAL_REVIEW (could be a typo; already known-adult
 *      by this point since #2/#3 didn't fire, so this is purely a
 *      profile-data-quality question, not a safety one).
 *   5. the document's name shares no word with the profile's display
 *      name (see namesShareAToken()) -> MANUAL_REVIEW -- a specific,
 *      real catfish signal (verified as someone, presenting as someone
 *      else entirely), but with enough innocent explanations (married
 *      name, a short-form nickname unrelated to the legal name, a
 *      transliteration difference) that it goes to a human, not an
 *      automated reject.
 *   6. otherwise -> VERIFIED.
 */
export function decideVerificationOutcome(params: {
  dobMatchedProfile: boolean;
  isDuplicate: boolean;
  ageStatus: AgeStatus;
  nameMatchesProfile: boolean | null;
}): VerificationDecision {
  const base = {
    dobMatchedProfile: params.dobMatchedProfile,
    isDuplicate: params.isDuplicate,
    ageStatus: params.ageStatus,
    nameMatchesProfile: params.nameMatchesProfile,
  };
  if (params.isDuplicate) {
    return { ...base, status: 'REJECTED', failureReason: 'duplicate_identity' };
  }
  if (params.ageStatus === 'minor') {
    return { ...base, status: 'REJECTED', failureReason: 'underage' };
  }
  if (params.ageStatus === 'unknown') {
    return { ...base, status: 'MANUAL_REVIEW', failureReason: 'dob_unavailable' };
  }
  if (!params.dobMatchedProfile) {
    return { ...base, status: 'MANUAL_REVIEW', failureReason: 'dob_mismatch' };
  }
  if (params.nameMatchesProfile === false) {
    return { ...base, status: 'MANUAL_REVIEW', failureReason: 'name_mismatch' };
  }
  return { ...base, status: 'VERIFIED' };
}

function datesMatch(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

const MINIMUM_AGE_YEARS = 18;

function ageStatusFor(dob: Date | null, asOf: Date = new Date()): AgeStatus {
  if (!dob) return 'unknown';
  let age = asOf.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = asOf.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && asOf.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  return age >= MINIMUM_AGE_YEARS ? 'adult' : 'minor';
}

/**
 * "One part of the ID's name matches one part of the profile's name" --
 * tokenize both (lowercase, diacritics stripped so e.g. transliteration
 * accents don't cause a spurious miss, single-letter initials dropped as
 * noise) and require at least one shared token. Deliberately loose: this
 * is a catfish-signal check, not an exact-match requirement, so nickname/
 * middle-name/order differences shouldn't trip it -- only a name that
 * shares literally nothing with the profile's should.
 */
function namesShareAToken(documentName: string, profileDisplayName: string): boolean {
  const tokenize = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1);
  const documentTokens = new Set(tokenize(documentName));
  const profileTokens = tokenize(profileDisplayName);
  return profileTokens.some((t) => documentTokens.has(t));
}

function categoryForFailureReason(reason: string | undefined): string {
  switch (reason) {
    case 'duplicate_identity':
      return 'scam_fraud';
    case 'underage':
      return 'underage'; // matches the category taxonomy already noted on ModerationCase.category
    case 'name_mismatch':
      return 'fake_catfish';
    default:
      return 'identity_verification'; // dob_mismatch, dob_unavailable
  }
}

/**
 * The one function both the real callback route and the mock completion
 * path call: takes a fetched document, runs duplicate + DOB checks,
 * writes the IdentityVerification audit row, opens a ModerationCase for
 * anything not a clean VERIFIED, and syncs Profile.verification (the
 * field lib/accountEnforcement.ts actually gates on) to match.
 */
export async function finalizeIdentityVerification(params: {
  userId: string;
  provider: 'mock' | 'digilocker';
  document: FetchedIdentityDocument;
}): Promise<VerificationDecision> {
  const { userId, provider, document } = params;

  const documentHash = hashDocumentReference(document.documentType, document.referenceForHash);
  const dup = await checkDuplicateIdentity(documentHash, userId);

  const profile = await db.profile.findUnique({ where: { userId }, select: { dateOfBirth: true, displayName: true } });
  const dobMatchedProfile = datesMatch(document.dateOfBirth, profile?.dateOfBirth ?? null);
  const ageStatus = ageStatusFor(document.dateOfBirth);
  const nameMatchesProfile =
    document.name && profile?.displayName ? namesShareAToken(document.name, profile.displayName) : null;

  const decision = decideVerificationOutcome({ dobMatchedProfile, isDuplicate: dup.isDuplicate, ageStatus, nameMatchesProfile });

  let moderationCaseId: string | undefined;
  if (decision.status !== 'VERIFIED') {
    const created = await db.moderationCase.create({
      data: {
        subjectUserId: userId,
        sourceType: 'AUTOMATED_FLAG',
        category: categoryForFailureReason(decision.failureReason),
        severity: decision.status === 'REJECTED' ? 'HIGH' : 'MEDIUM',
        status: 'OPEN',
        evidence: {
          documentType: document.documentType,
          referenceMasked: document.referenceMasked,
          failureReason: decision.failureReason,
          duplicateOfUserId: dup.existingUserId,
          ageStatus,
          nameMatchesProfile,
        },
      },
    });
    moderationCaseId = created.id;
  }

  // documentHash is @unique -- if two requests raced (double-submit), the
  // loser gets a clean Prisma unique-constraint error here rather than a
  // corrupted second row; that's acceptable (rare, user can just retry)
  // and deliberately not caught/retried to keep this function simple.
  await db.identityVerification.create({
    data: {
      userId,
      provider,
      documentType: document.documentType,
      documentHash,
      providerReference: document.providerReference,
      dobMatchedProfile,
      status: decision.status,
      failureReason: decision.failureReason,
      decidedAt: new Date(),
      moderationCaseId,
    },
  });

  await db.profile.update({ where: { userId }, data: { verification: decision.status } });

  return decision;
}

export { exchangeDigilockerCode, fetchDigilockerIdentityDocument };
