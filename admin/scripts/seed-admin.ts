import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { db } from '../lib/db';
import { hashPassword } from '../lib/password';

// Idempotent: safe to re-run. Creates/updates the real Super Admin account
// (piyushranjan985@gmail.com, per the account holder's own email -- see
// this repo's userEmail context), a handful of demo accounts across the
// other 10 roles so the Admin & Roles / permission-matrix pages have real
// rows to show, and sample Moderation/Support/Privacy/Config/Ops data so
// every module in the portal renders against real content instead of an
// empty state on first run. Every generated password is printed ONCE,
// here, and nowhere else -- there is no email delivery in this build (see
// app/api/admin-users/route.ts), so this is the only place they surface.
function randomPassword(): string {
  return randomBytes(12).toString('base64url'); // 16 chars, well over the 12-char minimum
}

async function upsertAdmin(email: string, name: string, role: Parameters<typeof db.adminUser.upsert>[0]['create']['role'], envPasswordVar?: string) {
  const existing = await db.adminUser.findUnique({ where: { email } });
  if (existing) {
    console.log(`  - ${email} already exists (role: ${existing.role}) -- leaving password untouched.`);
    return existing;
  }
  const password = (envPasswordVar && process.env[envPasswordVar]) || randomPassword();
  const passwordHash = await hashPassword(password);
  const admin = await db.adminUser.create({ data: { email, name, role, passwordHash } });
  console.log(`  - Created ${email} (${role}). Temporary password: ${password}`);
  return admin;
}

async function main() {
  console.log('Seeding admin accounts...');
  const superAdmin = await upsertAdmin('piyushranjan985@gmail.com', 'Piyush Ranjan', 'SUPER_ADMIN', 'ADMIN_SEED_PASSWORD');

  const [demoOperations, trustSafety, moderator, support, demoPrivacy, demoCompliance, demoAnalytics, demoReadOnly] = await Promise.all([
    upsertAdmin('demo.operations@vybematch.internal', 'Demo Operations', 'OPERATIONS'),
    upsertAdmin('demo.trustsafety@vybematch.internal', 'Demo Trust & Safety', 'TRUST_AND_SAFETY'),
    upsertAdmin('demo.moderator@vybematch.internal', 'Demo Moderator', 'MODERATOR'),
    upsertAdmin('demo.support@vybematch.internal', 'Demo Customer Support', 'CUSTOMER_SUPPORT'),
    upsertAdmin('demo.privacy@vybematch.internal', 'Demo Privacy Officer', 'PRIVACY_OFFICER'),
    upsertAdmin('demo.compliance@vybematch.internal', 'Demo Compliance Officer', 'COMPLIANCE_OFFICER'),
    upsertAdmin('demo.analytics@vybematch.internal', 'Demo Analytics', 'ANALYTICS'),
    upsertAdmin('demo.readonly@vybematch.internal', 'Demo Read Only', 'READ_ONLY'),
  ]);
  void demoOperations; void demoPrivacy; void demoCompliance; void demoAnalytics; void demoReadOnly;

  console.log('\nFetching a handful of existing consumer users to attach sample records to...');
  const users = await db.user.findMany({ take: 10, orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (users.length < 4) {
    console.log('  Fewer than 4 consumer users found -- run the consumer app\'s `npm run db:seed` first for richer sample data. Skipping sample content that needs real users.');
  }

  return { superAdmin, trustSafety, moderator, support, userIds: users.map((u) => u.id) };
}

main()
  .then(async (ctx) => {
    await seedSampleContent(ctx);
    console.log('\nDone. Sign in at /login with the Super Admin email above.');
  })
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

async function seedSampleContent(ctx: Awaited<ReturnType<typeof main>>) {
  const { superAdmin, trustSafety, moderator, support, userIds } = ctx;
  if (userIds.length < 4) return;
  const [u1, u2, u3, u4] = userIds;

  console.log('\nSeeding sample Moderation cases...');
  const existingCases = await db.moderationCase.count();
  if (existingCases === 0) {
    await db.moderationCase.createMany({
      data: [
        { subjectUserId: u1, sourceType: 'USER_REPORT', category: 'harassment', severity: 'HIGH', status: 'OPEN', assigneeId: trustSafety.id, slaDueAt: new Date(Date.now() + 24 * 3600 * 1000) },
        { subjectUserId: u2, sourceType: 'AUTOMATED_FLAG', category: 'spam', severity: 'LOW', status: 'IN_REVIEW', assigneeId: moderator.id, riskScore: 0.62, slaDueAt: new Date(Date.now() - 2 * 3600 * 1000) },
        { subjectUserId: u3, sourceType: 'CONTENT_REVIEW', category: 'photo_violation', severity: 'MEDIUM', status: 'RESOLVED', resolution: 'Photo removed; user warned.', resolvedAt: new Date(), resolvedById: moderator.id },
      ],
    });
  } else {
    console.log('  Moderation cases already exist -- skipping.');
  }

  console.log('Seeding sample Support tickets...');
  const existingTickets = await db.supportTicket.count();
  if (existingTickets === 0) {
    const ticket = await db.supportTicket.create({
      data: {
        userId: u1,
        subject: "Can't upload my verification photo",
        category: 'verification',
        priority: 'HIGH',
        status: 'OPEN',
        channel: 'IN_APP_FORM',
        assigneeId: support.id,
        slaDueAt: new Date(Date.now() - 3600 * 1000),
        messages: { create: [{ authorType: 'user', body: 'The camera step keeps failing on my phone.' }] },
      },
    });
    await db.supportTicket.create({
      data: { userId: u2, subject: 'How do I pause my profile?', category: 'account', priority: 'NORMAL', status: 'RESOLVED', resolvedAt: new Date(),
        messages: { create: [{ authorType: 'user', body: 'Want to take a break from discovery without deleting.' }, { authorType: 'admin', authorAdminId: support.id, body: 'You can enable Quiet Mode from Profile settings -- walked them through it.' }] } },
    });
    console.log(`  Created ticket ${ticket.id} and one resolved example.`);
  } else {
    console.log('  Support tickets already exist -- skipping.');
  }

  console.log('Seeding sample Consent records...');
  if ((await db.consentRecord.count()) === 0) {
    await db.consentRecord.createMany({
      data: [
        { userId: u1, purpose: 'ACCOUNT_ESSENTIAL', status: 'GRANTED', noticeVersion: '2026-01', source: 'onboarding' },
        { userId: u1, purpose: 'MARKETING_COMMUNICATIONS', status: 'GRANTED', noticeVersion: '2026-01', source: 'onboarding' },
        { userId: u1, purpose: 'MARKETING_COMMUNICATIONS', status: 'WITHDRAWN', noticeVersion: '2026-01', source: 'settings' },
        { userId: u2, purpose: 'ACCOUNT_ESSENTIAL', status: 'GRANTED', noticeVersion: '2026-01', source: 'onboarding' },
        { userId: u2, purpose: 'PRECISE_LOCATION', status: 'GRANTED', noticeVersion: '2026-01', source: 'settings' },
      ],
    });
  } else {
    console.log('  Consent records already exist -- skipping.');
  }

  console.log('Seeding sample Privacy requests...');
  if ((await db.privacyRequest.count()) === 0) {
    await db.privacyRequest.createMany({
      data: [
        { userId: u3, type: 'ACCESS', status: 'RECEIVED', description: 'Wants a copy of everything we hold.', dueAt: new Date(Date.now() + 20 * 24 * 3600 * 1000) },
        { userId: u4, type: 'CORRECTION', status: 'IN_PROGRESS', description: 'Date of birth is wrong on file.', dueAt: new Date(Date.now() - 1 * 24 * 3600 * 1000), handledById: support.id },
        { contactEmail: 'former-user@example.com', type: 'GRIEVANCE', status: 'RECEIVED', description: 'Unhappy with how a report about them was handled.', dueAt: new Date(Date.now() + 6 * 24 * 3600 * 1000) },
      ],
    });
  } else {
    console.log('  Privacy requests already exist -- skipping. (Deliberately no seeded DELETION/COMPLETED request -- that would anonymize a real seeded user; run that flow live from the Privacy Centre instead.)');
  }

  console.log('Seeding a sample Privacy incident...');
  if ((await db.privacyIncident.count()) === 0) {
    await db.privacyIncident.create({
      data: {
        title: 'OTP gateway vendor logged phone numbers in plaintext',
        description: 'Third-party SMS/OTP provider\'s debug logging briefly captured full phone numbers instead of the masked form in the integration contract.',
        severity: 'MEDIUM',
        status: 'CONTAINED',
        detectedAt: new Date(Date.now() - 5 * 24 * 3600 * 1000),
        containedAt: new Date(Date.now() - 4 * 24 * 3600 * 1000),
        affectedUserCount: 42,
        affectedDataCategories: ['phone numbers'],
        rootCause: 'Vendor debug flag left on after a config change on their side.',
        remediation: 'Vendor confirmed logs purged; debug flag disabled; added a quarterly vendor log-config check to admin/docs/DPDP_COMPLIANCE.md\'s review items.',
        ownerId: superAdmin.id,
        timeline: { create: [
          { note: "Incident logged from vendor's own disclosure email.", authorId: superAdmin.id },
          { note: 'Confirmed scope: 42 users, phone numbers only, no passwords or messages.', authorId: superAdmin.id },
          { note: 'Vendor purged logs and disabled debug flag; status moved to Contained.', authorId: superAdmin.id },
        ] },
      },
    });
  } else {
    console.log('  Privacy incidents already exist -- skipping.');
  }

  console.log('Seeding Data processors, retention policies, processing activities...');
  if ((await db.dataProcessor.count()) === 0) {
    await db.dataProcessor.createMany({
      data: [
        { name: 'Neon (Postgres hosting)', purpose: 'Primary database hosting', dataCategories: ['All application data'], country: 'United States', dpaSignedAt: new Date('2025-01-01') },
        { name: 'Vercel', purpose: 'Application hosting and Vercel Blob photo storage', dataCategories: ['Profile photos', 'Application logs'], country: 'United States', dpaSignedAt: new Date('2025-01-01') },
        { name: 'SMS/OTP gateway (placeholder vendor)', purpose: 'Phone number verification via OTP', dataCategories: ['Phone numbers'], country: 'India' },
      ],
    });
  }
  if ((await db.retentionPolicy.count()) === 0) {
    await db.retentionPolicy.createMany({
      data: [
        { dataCategory: 'OTP codes', retentionDays: 1, legalBasis: 'Necessary for authentication; no purpose after expiry.', autoDeleteEnabled: false },
        { dataCategory: 'Expired/unmatched swipes', retentionDays: 180, legalBasis: 'Product analytics and abuse detection.', autoDeleteEnabled: false },
        { dataCategory: 'Deleted-account residual data', retentionDays: 30, legalBasis: 'Legal/fraud hold window after DPDP deletion request completion.', autoDeleteEnabled: false },
        { dataCategory: 'Login/session history', retentionDays: 365, legalBasis: 'Security investigation and account-recovery support.', autoDeleteEnabled: false },
      ],
    });
  }
  if ((await db.processingActivity.count()) === 0) {
    await db.processingActivity.createMany({
      data: [
        { name: 'Discovery matching', purpose: 'Show compatible profiles based on stated preferences and location', dataCategories: ['Profile data', 'Approximate location'], legalBasis: 'Consent', recipients: [], ownerId: superAdmin.id },
        { name: 'Phone/email verification', purpose: 'Confirm account holder controls the phone number or email used to sign up', dataCategories: ['Phone number', 'Email address'], legalBasis: 'Consent', recipients: ['SMS/OTP gateway (placeholder vendor)'], ownerId: superAdmin.id },
        { name: 'Marketing communications', purpose: 'Send opt-in product updates and re-engagement messages', dataCategories: ['Email address', 'Phone number'], legalBasis: 'Consent', recipients: [], ownerId: superAdmin.id },
      ],
    });
  }

  console.log('Seeding Feature flags and Notification templates...');
  if ((await db.featureFlag.count()) === 0) {
    await db.featureFlag.createMany({
      data: [
        { key: 'maintenance_mode', label: 'Maintenance mode', description: 'Shows a maintenance page to all consumer-app users when enabled (not yet wired into the consumer app -- see Configuration page).', enabled: false, rolloutPercent: 100 },
        { key: 'new_discovery_algo', label: 'New discovery algorithm', description: 'Experimental ranking change for the Discover feed.', enabled: false, rolloutPercent: 0 },
      ],
    });
  }
  if ((await db.notificationTemplate.count()) === 0) {
    await db.notificationTemplate.createMany({
      data: [
        { key: 'account.suspended', channel: 'email', subject: 'Your VybeMatch account has been suspended', body: 'Hi {{name}}, your account was suspended for {{reason}}. Contact support if you think this is a mistake.' },
        { key: 'account.banned', channel: 'email', subject: 'Your VybeMatch account has been banned', body: 'Hi {{name}}, your account has been permanently banned for violating our community guidelines: {{reason}}.' },
        { key: 'privacy.deletion.completed', channel: 'email', subject: 'Your data deletion request is complete', body: 'Hi, we\'ve completed your DPDP deletion request. Your account has been anonymized as described in our Privacy Policy.' },
        { key: 'privacy.request.received', channel: 'in_app', subject: null, body: 'We\'ve received your privacy request and will respond within the timeframe stated in our Privacy Policy.' },
      ],
    });
  }

  console.log('Seeding one acknowledged Ops alert (for the Notifications page\'s "recently acknowledged" section)...');
  if ((await db.opsAlert.count()) === 0) {
    await db.opsAlert.create({
      data: {
        category: 'VERIFICATION', severity: 'INFO', title: 'Verification approval backlog cleared',
        detail: 'The verification queue was briefly backed up during a traffic spike; cleared within SLA.',
        acknowledgedById: superAdmin.id, acknowledgedAt: new Date(),
      },
    });
  }
}
