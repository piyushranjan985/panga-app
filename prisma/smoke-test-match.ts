/**
 * Creates two fully-onboarded test accounts that are already mutually
 * matched, so the post-match experience (Vybe starters, Ask about me,
 * Make a plan, Match Profile, the ... safety menu) can be smoke-tested
 * immediately without first fumbling through swiping in two browser
 * sessions until the feed happens to surface the other account.
 *
 * Both accounts get real overlap (shared interests, a shared tribe, two
 * shared relationship styles) so every "shared Vybe" surface has
 * something real to show, not empty states.
 *
 * Idempotent -- safe to re-run; it upserts by phone number and by the
 * unique [userAId, userBId] match pair, same as prisma/seed.ts and
 * app/api/swipe/route.ts.
 *
 * Run with: npm run db:smoke-test
 * Then log in with either phone number below and OTP 123456 (this
 * project's dev-mode mock OTP -- see lib/otp.ts).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import crypto from 'node:crypto';
import { INTERESTS, TRIBES, RELATIONSHIP_STYLES, PROMPTS } from '../lib/constants';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

function hashOtp(code: string) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function pravatar(n: number): string {
  return `https://i.pravatar.cc/500?img=${((n - 1) % 70) + 1}`;
}

// Deterministic ordering for the Match row's unique [userAId, userBId]
// pair -- same rule as app/api/swipe/route.ts's orderedPair, so this
// script creates exactly the row the real match flow would.
function orderedPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

const SHARED_INTERESTS = ['Coffee', 'Gaming', 'Travel'];
const SHARED_TRIBE_SLUG = 'gaming';
const SHARED_RELATIONSHIP_STYLES = ['Deep conversations', 'Lots of laughs'];

// Two Vybe Check prompts, seeded with one MATCHING answer (both pick the
// same option -- Tier 1 "exactVybe" in lib/matchSignals.ts) and one
// DIFFERING answer (the "complementary/difference" signal) -- otherwise
// neither of those two tiers would ever be testable against these two
// accounts. See the post-match spec's tiered signal engine.
const MATCHING_PROMPT_TEXT = 'Communication: talk it out or take space first?';
const DIFFERING_PROMPT_TEXT = 'Love language: words or actions?';

interface TestUser {
  phone: string;
  displayName: string;
  dob: string;
  gender: 'WOMAN' | 'MAN';
  lookingFor: ('WOMAN' | 'MAN')[];
  city: string;
  bio: string;
  avatarHue: number;
  interests: string[];
  relationshipStyles: string[];
  photo: string;
}

const USER_A: TestUser = {
  phone: '+919999900001',
  displayName: 'TestPriya',
  dob: '2000-04-18',
  gender: 'WOMAN',
  lookingFor: ['MAN'],
  city: 'Mumbai',
  bio: 'Smoke-test account -- Coffee, Gaming, Travel person.',
  avatarHue: 2,
  interests: [...SHARED_INTERESTS, 'Foodie'],
  relationshipStyles: [...SHARED_RELATIONSHIP_STYLES, 'Adventure partners'],
  photo: pravatar(61),
};

const USER_B: TestUser = {
  phone: '+919999900002',
  displayName: 'TestKabir',
  dob: '1998-11-02',
  gender: 'MAN',
  lookingFor: ['WOMAN'],
  city: 'Mumbai',
  bio: 'Smoke-test account -- also Coffee, Gaming, Travel.',
  avatarHue: 5,
  interests: [...SHARED_INTERESTS, 'Books'],
  relationshipStyles: [...SHARED_RELATIONSHIP_STYLES, 'Career + relationship balance'],
  photo: pravatar(14),
};

async function ensureReferenceData() {
  const neededInterestLabels = new Set([...USER_A.interests, ...USER_B.interests]);
  for (const i of INTERESTS.filter((i) => neededInterestLabels.has(i.label))) {
    await db.interest.upsert({
      where: { label: i.label },
      update: { emoji: i.emoji, tagline: i.tagline, intents: i.intents },
      create: i,
    });
  }

  const tribe = TRIBES.find((t) => t.slug === SHARED_TRIBE_SLUG);
  if (!tribe) throw new Error(`Tribe "${SHARED_TRIBE_SLUG}" not found in lib/constants.ts`);
  const tribeRow = await db.tribe.upsert({
    where: { slug: tribe.slug },
    update: {
      label: tribe.label,
      emoji: tribe.emoji,
      personaLabel: tribe.personaLabel,
      activityPhrase: tribe.activityPhrase,
      sharedPhrase: tribe.sharedPhrase,
      intents: tribe.intents,
    },
    create: {
      slug: tribe.slug,
      label: tribe.label,
      emoji: tribe.emoji,
      personaLabel: tribe.personaLabel,
      activityPhrase: tribe.activityPhrase,
      sharedPhrase: tribe.sharedPhrase,
      intents: tribe.intents,
    },
  });
  const subCommunityLabel = tribe.subCommunities[0]; // "Nintendo" for gaming
  const subCommunityRow = subCommunityLabel
    ? await db.subCommunity.upsert({
        where: { tribeId_label: { tribeId: tribeRow.id, label: subCommunityLabel } },
        update: {},
        create: { tribeId: tribeRow.id, label: subCommunityLabel },
      })
    : null;

  const neededStyleLabels = new Set([...USER_A.relationshipStyles, ...USER_B.relationshipStyles]);
  for (const r of RELATIONSHIP_STYLES.filter((r) => neededStyleLabels.has(r.label))) {
    await db.relationshipStyle.upsert({
      where: { label: r.label },
      update: { emoji: r.emoji, pairPhrase: r.pairPhrase },
      create: r,
    });
  }

  const neededPromptTexts = new Set([MATCHING_PROMPT_TEXT, DIFFERING_PROMPT_TEXT]);
  const promptRows = new Map<string, { id: string }>();
  for (const p of PROMPTS.filter((p) => neededPromptTexts.has(p.text))) {
    const row = await db.prompt.upsert({
      where: { text: p.text },
      update: { emoji: p.emoji, optionA: p.optionA, optionB: p.optionB, intents: p.intents },
      create: p,
    });
    promptRows.set(p.text, row);
  }

  return { tribeRow, subCommunityRow, promptRows };
}

async function upsertTestUser(
  u: TestUser,
  tribeId: string,
  subCommunityId: string | null,
) {
  const user = await db.user.upsert({
    where: { phone: u.phone },
    update: {},
    create: { phone: u.phone, phoneVerified: true },
  });

  const interestRows = await db.interest.findMany({ where: { label: { in: u.interests } } });
  const relationshipStyleRows = await db.relationshipStyle.findMany({
    where: { label: { in: u.relationshipStyles } },
  });

  const profile = await db.profile.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      displayName: u.displayName,
      dateOfBirth: new Date(u.dob),
      gender: u.gender,
      lookingFor: u.lookingFor,
      city: u.city,
      bio: u.bio,
      intent: 'SOMETHING_REAL',
      avatarSeed: u.displayName.charAt(0),
      avatarHue: u.avatarHue,
      verification: 'VERIFIED',
      interests: { connect: interestRows.map((i) => ({ id: i.id })) },
      tribes: { connect: [{ id: tribeId }] },
      subCommunities: subCommunityId ? { connect: [{ id: subCommunityId }] } : undefined,
      relationshipStyles: { connect: relationshipStyleRows.map((r) => ({ id: r.id })) },
      photos: { create: [{ url: u.photo, position: 0 }] },
    },
  });

  // Same idempotency pattern as prisma/seed.ts: `connect` only adds, so
  // it's safe to run on every re-run, and photos only get backfilled if
  // this profile somehow has none yet (never overwrites a real upload).
  await db.profile.update({
    where: { id: profile.id },
    data: {
      interests: { connect: interestRows.map((i) => ({ id: i.id })) },
      tribes: { connect: [{ id: tribeId }] },
      subCommunities: subCommunityId ? { connect: [{ id: subCommunityId }] } : undefined,
      relationshipStyles: { connect: relationshipStyleRows.map((r) => ({ id: r.id })) },
    },
  });
  const existingPhotoCount = await db.photo.count({ where: { profileId: profile.id } });
  if (existingPhotoCount === 0) {
    await db.photo.create({ data: { profileId: profile.id, url: u.photo, position: 0 } });
  }

  // Dev-mode OTP is always 123456 by default (see lib/otp.ts), but insert
  // a long-lived one anyway -- matches prisma/seed.ts's demo accounts, and
  // covers the case where OTP_PROVIDER is set to something other than mock.
  await db.otpCode.create({
    data: {
      userId: user.id,
      codeHash: hashOtp('123456'),
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });

  return user;
}

async function main() {
  const { tribeRow, subCommunityRow, promptRows } = await ensureReferenceData();

  const userA = await upsertTestUser(USER_A, tribeRow.id, subCommunityRow?.id ?? null);
  const userB = await upsertTestUser(USER_B, tribeRow.id, subCommunityRow?.id ?? null);

  // Vybe Check answers -- one matching pair, one differing pair (see the
  // MATCHING_PROMPT_TEXT / DIFFERING_PROMPT_TEXT comment above).
  const profileA = await db.profile.findUniqueOrThrow({ where: { userId: userA.id } });
  const profileB = await db.profile.findUniqueOrThrow({ where: { userId: userB.id } });
  const matchingPrompt = promptRows.get(MATCHING_PROMPT_TEXT);
  const differingPrompt = promptRows.get(DIFFERING_PROMPT_TEXT);
  if (matchingPrompt) {
    for (const profile of [profileA, profileB]) {
      await db.promptAnswer.upsert({
        where: { profileId_promptId: { profileId: profile.id, promptId: matchingPrompt.id } },
        update: { answer: 'Talk it out immediately' },
        create: { profileId: profile.id, promptId: matchingPrompt.id, answer: 'Talk it out immediately' },
      });
    }
  }
  if (differingPrompt) {
    await db.promptAnswer.upsert({
      where: { profileId_promptId: { profileId: profileA.id, promptId: differingPrompt.id } },
      update: { answer: 'Words & reassurance' },
      create: { profileId: profileA.id, promptId: differingPrompt.id, answer: 'Words & reassurance' },
    });
    await db.promptAnswer.upsert({
      where: { profileId_promptId: { profileId: profileB.id, promptId: differingPrompt.id } },
      update: { answer: 'Actions & affection' },
      create: { profileId: profileB.id, promptId: differingPrompt.id, answer: 'Actions & affection' },
    });
  }

  // Mutual VYBE swipes, then the Match row -- exactly what
  // app/api/swipe/route.ts does when both sides like each other, just
  // invoked directly instead of through two swipe gestures.
  await db.swipe.upsert({
    where: { fromUserId_toUserId: { fromUserId: userA.id, toUserId: userB.id } },
    update: { action: 'VYBE' },
    create: { fromUserId: userA.id, toUserId: userB.id, action: 'VYBE' },
  });
  await db.swipe.upsert({
    where: { fromUserId_toUserId: { fromUserId: userB.id, toUserId: userA.id } },
    update: { action: 'VYBE' },
    create: { fromUserId: userB.id, toUserId: userA.id, action: 'VYBE' },
  });

  const [userAId, userBId] = orderedPair(userA.id, userB.id);
  const match = await db.match.upsert({
    where: { userAId_userBId: { userAId, userBId } },
    update: { unmatchedAt: null, hiddenAAt: null, hiddenBAt: null },
    create: { userAId, userBId },
  });

  console.log('');
  console.log('Smoke-test accounts ready and already matched:');
  console.log(`  1) ${USER_A.displayName}  phone: ${USER_A.phone}`);
  console.log(`  2) ${USER_B.displayName}  phone: ${USER_B.phone}`);
  console.log('  OTP for both (dev mode): 123456');
  console.log(`  matchId: ${match.id}`);
  console.log('');
  console.log('Log in as one on your regular browser and the other in an');
  console.log('incognito/private window (each browser holds one session');
  console.log('cookie) -- both land straight in /matches with this match');
  console.log('ready to open and test.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
