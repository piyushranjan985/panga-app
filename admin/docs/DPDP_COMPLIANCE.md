# DPDP Compliance -- Admin Portal Reference

This document explains how the findmyVybe Admin Portal's Privacy & Compliance
Centre maps to India's **Digital Personal Data Protection Act, 2023** (DPDP
Act) and the **Digital Personal Data Protection Rules, 2025** (DPDP Rules),
which commence in phases. It is **operational documentation for the team
running this portal**, not a legal opinion -- have counsel review this
before it is relied on for a real compliance deadline, a real Board
notification, or a real regulatory inquiry.

## 1. Scope

findmyVybe is a Data Fiduciary under the Act. Its users are Data Principals.
The admin portal is the tooling the Trust & Safety / Privacy / Compliance
team uses to operate the obligations below. It does not replace legal
review, a Consent Manager integration, or a DPIA where one is required --
it is where evidence of compliance is recorded and where the workflows
happen.

## 2. Consent (Sections 4-7, DPDP Act)

- **Where it lives:** `ConsentRecord` (Prisma) / Privacy & Compliance ->
  Consent Records in the portal.
- **Design:** append-only. Withdrawing consent inserts a new `WITHDRAWN`
  row rather than mutating the `GRANTED` one, so the full history of what a
  Data Principal actually agreed to -- and when -- is always
  reconstructable, per Section 6's requirement that consent be as easy to
  withdraw as to give and that the fact of withdrawal be recorded.
- **Purpose tagging:** `ConsentPurpose` (`ACCOUNT_ESSENTIAL`,
  `PRECISE_LOCATION`, `MARKETING_COMMUNICATIONS`, `ANALYTICS`,
  `THIRD_PARTY_SHARING`) keeps consent purpose-specific rather than one
  blanket flag, per Section 6(1)'s itemised-notice requirement.
- **Not yet done:** a certified Consent Manager integration (Rule 13-style
  Consent Manager registration/interoperability) is out of scope for this
  build -- consent today is collected directly in the consumer app and
  logged here. Revisit if/when Consent Manager registration becomes a
  practical requirement for findmyVybe's scale.

## 3. Data Principal rights (Sections 11-14)

- **Where it lives:** `PrivacyRequest` / Privacy & Compliance -> Requests.
- **Rights covered:** `ACCESS` (Section 11), `CORRECTION` and completeness
  updates (Section 12), `DELETION` / erasure (Section 12), `GRIEVANCE`
  (Section 13), `PORTABILITY` where applicable, and `CONSENT_WITHDRAWAL`.
  One model, one workflow shape (`RECEIVED -> VERIFYING_IDENTITY ->
  IN_PROGRESS -> COMPLETED/REJECTED`) for all six, since the intake and
  identity-verification steps are the same regardless of which right is
  being exercised.
- **Identity verification:** the `VERIFYING_IDENTITY` status is a
  deliberate step before any right is actioned -- the portal does not
  verify identity for the team; a handler moves a request into this status
  and is expected to have confirmed the requester controls the account
  (e.g. via the same phone/email OTP the consumer app already uses) before
  moving it to `IN_PROGRESS`.
- **Response time:** `dueAt` is a target the compliance team sets per
  request; the Rules' specific turnaround windows (once notified in force)
  should be encoded here as the operative deadline once confirmed by
  counsel. The Requests list highlights anything past `dueAt` as overdue.
- **Deletion / erasure:** completing a `DELETION` request calls the same
  `anonymizeUserAccount()` used by the User Management "Delete account"
  action -- it scrubs directly-identifying fields (email, phone, social
  IDs, display name, bio, precise location) but keeps the row and its
  relational history, since moderation/legal evidence and aggregate
  product analytics need the row to keep existing. This is a considered
  trade-off, not an oversight -- confirm with counsel whether pseudonymised
  retention of this shape satisfies "erasure" for findmyVybe's specific
  data categories, or whether some fields need harder deletion.
- **Data export (Access / Portability):** generated on demand as JSON via
  `GET /api/privacy/requests/:id/export` (`admin/lib/privacyExport.ts`)
  rather than pre-built and stored in blob storage -- no such storage is
  wired up yet. The export deliberately excludes the identity of anyone
  who *reported* this user (safety/retaliation risk), while including
  reports *they* filed, their own messages, matches, swipes, consent
  history, and login history.

## 4. Grievance redressal (Section 13)

- Routed through the same `PrivacyRequest` model as `type: GRIEVANCE` (a
  Data Principal's escalation path when they're unhappy with how a
  Fiduciary has handled their data), and through Support Centre tickets
  for anything that isn't specifically a rights request. **A Grievance
  Officer must be named and their contact details published** per Section
  13(1) -- that is a product/legal action outside this portal's scope
  (it belongs in the consumer app's Privacy Policy / Help Center), not
  something this codebase can satisfy on its own.

## 5. Security safeguards (Section 8(5))

- RBAC (`admin/lib/rbac.ts`): 11 roles, ~50 explicitly-enumerated
  permissions, no inheritance -- every role's grant is spelled out
  directly so "who can do what" is always readable from one file.
- MFA: TOTP-based, required for every admin account (`admin/lib/mfa.ts`).
- Step-up auth: the highest-risk actions (ban, delete account, complete a
  privacy request, manage an incident, place/release a legal hold, approve
  a config change, manage admin users) demand a fresh password + MFA check
  within the last `ADMIN_STEP_UP_TTL_MINUTES` even from an already
  logged-in admin (`STEP_UP_REQUIRED` in `admin/lib/rbac.ts`).
- PII masking by default: email/phone are masked everywhere in the UI;
  unmasking is its own permission-gated, audit-logged action
  (`users.viewSensitivePII`), never a side effect of just viewing a user.
- Audit logging: every sensitive read and every mutation writes to
  `AuditLogEntry` via the single `writeAudit()` helper (never touched
  directly) -- actor, action, target, before/after values, reason,
  request ID, IP, and user agent, every time.

## 6. Breach / incident notification (Rule 7 and Section 8(6))

- **Where it lives:** `PrivacyIncident` / Privacy & Compliance -> Privacy
  & Security Incidents.
- **Workflow:** `DETECTED -> ASSESSING -> CONTAINED -> BOARD_NOTIFIED ->
  USERS_NOTIFIED -> CLOSED`, with a full timeline
  (`PrivacyIncidentEvent`) of notes attached to every status change.
  `BOARD_NOTIFIED` and `USERS_NOTIFIED` each stamp their own timestamp,
  since the DPDP Rules' notification timelines (once the Board's specific
  procedural rules are in force) are measured from detection/assessment,
  not from when the incident is closed.
- **Not yet done:** the Rules' exact Board notification format, channel,
  and timeline are to be specified by the Data Protection Board of India
  and are still being operationalised as of this build -- confirm the
  concrete SLA and notification template with counsel before an actual
  breach, and update `dueAt`-style deadlines here once that's settled.
  Every field this workflow captures (severity, affected user count,
  affected data categories, root cause, remediation) is the evidence a
  real notification would need to cite.

## 7. Data minimisation, retention, and the processing register

- **Retention:** `RetentionPolicy` / Privacy & Compliance -> Retention
  Policies -- one row per data category, with a retention period, legal
  basis, and an `autoDeleteEnabled` flag. No automatic purge job exists
  yet; the flag only records intent for when one is built (deliberately --
  standing up an automatic bulk-delete job against production data is
  exactly the kind of functionality the original brief says not to invent
  without it being asked for).
- **Record of processing activities:** `ProcessingActivity` / Privacy &
  Compliance -> Processing Activities -- the lightweight documentation
  inventory most privacy regimes (and DPDP by implication, through its
  accountability requirements) expect a controller to maintain: what's
  processed, why, on what legal basis, shared with whom, and whether a
  DPIA is required.
- **Vendor / processor register:** `DataProcessor` / Privacy & Compliance
  -> Data Processors -- every third party findmyVybe shares data with
  (SMS/OTP gateway, hosting, blob storage, ...), per Section 8(2)'s
  requirement that a Fiduciary ensure its processors also protect the
  data.

## 8. Legal holds

- `LegalHold` blocks a `DELETION` request from being completed against a
  user under an active hold (e.g. an open moderation case, a legal
  dispute, or a law-enforcement request) -- see
  `app/api/privacy/requests/[requestId]/route.ts`. Placing or releasing a
  hold is step-up gated and always audit-logged with a reason.

## 9. What still needs counsel / leadership sign-off before go-live

1. The Grievance Officer's name and published contact details (Section
   13(1)) -- a product/legal action, not a code change.
2. Confirming `anonymizeUserAccount()`'s scrub-and-retain approach actually
   satisfies "erasure" for every data category findmyVybe holds, or whether
   some fields need harder deletion once a request is `COMPLETED`.
3. The concrete Board-notification timeline and format once the DPDP
   Rules' breach-notification provisions are in force for Fiduciaries at
   findmyVybe's scale.
4. Whether a Consent Manager integration becomes necessary as the DPDP
   Rules' phased commencement continues.
5. A DPIA for any processing activity flagged `dpiaRequired` in the
   Processing Activities register.

This portal is built to make all of the above auditable and operable once
counsel confirms the specifics -- it does not make the specifics up.
