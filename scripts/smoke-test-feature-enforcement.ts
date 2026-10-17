/**
 * End-to-end functional check, against a real database, of the Oct 2026
 * "wire every FeatureKey/CreditFeatureKey into real enforcement" pass --
 * the DB-touching counterpart to tests/swipeCap.test.ts (which stays
 * DB-free, same convention as every other tests/*.test.ts file). Exits
 * non-zero on any assertion failure, same convention as
 * scripts/smoke-test-payments.ts and prisma/smoke-test-match.ts.
 *
 * Covers the shared LIB-level logic every new route handler is built on
 * (lib/payments/entitlements.ts's isFeatureLocked, lib/payments/
 * visibilityBoost.ts, lib/vybeVouch.ts's vouchPendingCap, lib/payments/
 * swipeCap.ts) -- NOT the Next.js route handlers themselves (this
 * project's existing DB smoke-test scripts don't exercise routes over
 * HTTP either; see scripts/smoke-test-payments.ts). The single most
 * important invariant checked here is isFeatureLocked's Free_Tier
 * short-circuit, since getting that backwards would silently gate
 * everyone while Free_Tier=true -- the opposite of what that flag
 * promises.
 *
 * Creates/reuses two throwaway test users (fixed phone numbers, safe to
 * re-run) and resets their Subscription/CreditBalance/CreditLedgerEntry
 * rows at the start of every run so results don't drift across runs.
 *
 * Run with: npm run db:smoke-test:feature-enforcement
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

// Same reason as scripts/smoke-test-payments.ts: set before importing
// anything that reads these, lib/payments/flags.ts reads process.env
// live on every call either way.
process.env.Free_Tier = 'false';
process.env.PAYMENT_MODE = 'mock';

import { getEntitlements, isFeatureLocked, spendCredits } from '../lib/payments/entitlements';
import { getFreeTierSwipeDailyCap, evaluateFreeSwipeCount } from '../lib/payments/swipeCap';
import {
  getPriorityPlacementUserIds,
  getActiveVisibilityBoostBonus,
  getOwnActiveBoostStatus,
  PROFILE_BOOST_SCORE_BONUS,
  PROFILE_SPOTLIGHT_SCORE_BONUS,
} from '../lib/payments/visibilityBoost';
import { vouchPendingCap, VOUCH_MAX_PENDING_PER_MATCH, VOUCH_EXTRA_PENDING_FOR_FEATURE } from '../lib/vybeVouch';
import { CREDIT_FEATURE_COSTS } from '../lib/payments/types';

let failures = 0;
function assertEqual(actual: unknown, expected: unknown, label: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${ok ? '' : ` -- expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
  if (!ok) failures++;
}
function assertTrue(actual: boolean, label: string) {
  assertEqual(actual, true, label);
}

async function upsertTestUser(phone: string, displayName: string) {
  return db.user.upsert({
    where: { phone },
    create: {
      phone,
      phoneVerified: true,
      profile: {
        create: { displayName, dateOfBirth: new Date('1997-01-01'), gender: 'MAN', lookingFor: ['WOMAN'], city: 'Delhi', intent: 'RISHTA_READY' },
      },
    },
    update: {},
  });
}

async function main() {
  const userA = await upsertTestUser('+919999000211', 'Feature Enforcement Smoke A');
  const userB = await upsertTestUser('+919999000212', 'Feature Enforcement Smoke B');

  // Reset so repeated runs are deterministic.
  await db.subscription.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
  await db.creditLedgerEntry.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });
  await db.creditBalance.deleteMany({ where: { userId: { in: [userA.id, userB.id] } } });

  // --- isFeatureLocked's Free_Tier short-circuit (the most important
  //     invariant in this whole pass -- see the file comment above) ----
  process.env.Free_Tier = 'true';
  const freeTierEntitlements = await getEntitlements(userA.id);
  assertEqual(freeTierEntitlements.freeTier, true, 'getEntitlements reports freeTier=true');
  assertEqual(freeTierEntitlements.features.unlimited_swipes, false, "...with every per-feature flag false (allFeaturesOff's implementation detail)");
  assertTrue(
    !isFeatureLocked(freeTierEntitlements, 'unlimited_swipes'),
    'isFeatureLocked() is FALSE while Free_Tier=true, even though the per-feature flag above is false -- the whole point of the short-circuit',
  );
  process.env.Free_Tier = 'false';

  // --- With Free_Tier=false and no subscription, every gate is locked -
  const noSubEntitlements = await getEntitlements(userA.id);
  assertEqual(noSubEntitlements.freeTier, false, 'getEntitlements reports freeTier=false once the flag is off');
  assertTrue(isFeatureLocked(noSubEntitlements, 'unlimited_swipes'), 'isFeatureLocked() is TRUE for a plan-less user once Free_Tier=false');

  // --- Granting a subscription unlocks exactly its plan's features ----
  const realPlusPlan = await db.paymentPlan.findFirst({ where: { slug: 'real-plus', isActive: true } });
  const rishtaPlan = await db.paymentPlan.findFirst({ where: { slug: 'rishta-premium', isActive: true } });
  if (!realPlusPlan || !rishtaPlan) {
    console.error('Run `npm run db:seed:payments` first -- real-plus / rishta-premium not found.');
    process.exit(1);
  }

  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.subscription.create({
    data: { userId: userA.id, planId: realPlusPlan.id, status: 'ACTIVE', currentPeriodStart: new Date(), currentPeriodEnd: periodEnd },
  });
  await db.subscription.create({
    data: { userId: userB.id, planId: rishtaPlan.id, status: 'ACTIVE', currentPeriodStart: new Date(), currentPeriodEnd: periodEnd },
  });

  const userAEntitlements = await getEntitlements(userA.id);
  assertTrue(!isFeatureLocked(userAEntitlements, 'unlimited_swipes'), 'real-plus unlocks unlimited_swipes for userA');
  assertTrue(isFeatureLocked(userAEntitlements, 'priority_placement'), "real-plus does NOT unlock priority_placement -- it's not in that plan");

  // --- priority_placement: scoped lookup over a candidate list ---------
  const priorityUserIds = await getPriorityPlacementUserIds([userA.id, userB.id]);
  assertTrue(priorityUserIds.has(userB.id), 'getPriorityPlacementUserIds includes userB (rishta-premium grants priority_placement)');
  assertTrue(!priorityUserIds.has(userA.id), '...and excludes userA (real-plus does not)');

  // --- extra_vybe_vouch_invites: pure cap combination -------------------
  assertEqual(vouchPendingCap(false), VOUCH_MAX_PENDING_PER_MATCH, 'vouchPendingCap(false) is the base cap');
  assertEqual(vouchPendingCap(true), VOUCH_MAX_PENDING_PER_MATCH + VOUCH_EXTRA_PENDING_FOR_FEATURE, 'vouchPendingCap(true) adds the extra-invites bonus');

  // --- unlimited_swipes: the monetization cap's pure comparison --------
  const freeCap = getFreeTierSwipeDailyCap();
  assertTrue(evaluateFreeSwipeCount(freeCap, freeCap - 1).ok, 'one swipe under the free cap is still OK');
  assertTrue(!evaluateFreeSwipeCount(freeCap, freeCap).ok, 'at the free cap, the next swipe is blocked');

  // --- profile_boost / profile_spotlight: spend -> active window -------
  await db.creditBalance.create({ data: { userId: userA.id, balance: 100 } });
  const boostSpent = await spendCredits(userA.id, CREDIT_FEATURE_COSTS.profile_boost, 'feature_redeem:profile_boost');
  assertTrue(boostSpent, 'spendCredits succeeds for profile_boost with a sufficient balance');

  const boostBonus = await getActiveVisibilityBoostBonus([userA.id, userB.id]);
  assertEqual(boostBonus.get(userA.id), PROFILE_BOOST_SCORE_BONUS, 'getActiveVisibilityBoostBonus reflects the just-spent profile_boost');
  assertTrue(!boostBonus.has(userB.id), '...and is absent for a user with no recent spend');

  const ownStatusAfterBoost = await getOwnActiveBoostStatus(userA.id);
  assertEqual(ownStatusAfterBoost?.kind, 'profile_boost', "getOwnActiveBoostStatus reports 'profile_boost' right after spending it");

  // Spending profile_spotlight afterward upgrades the active window --
  // the most RECENT spend governs (see lib/payments/visibilityBoost.ts).
  const spotlightSpent = await spendCredits(userA.id, CREDIT_FEATURE_COSTS.profile_spotlight, 'feature_redeem:profile_spotlight');
  assertTrue(spotlightSpent, 'spendCredits succeeds for profile_spotlight');
  const ownStatusAfterSpotlight = await getOwnActiveBoostStatus(userA.id);
  assertEqual(ownStatusAfterSpotlight?.kind, 'profile_spotlight', 'a later profile_spotlight spend supersedes the earlier profile_boost');
  const boostBonusAfterSpotlight = await getActiveVisibilityBoostBonus([userA.id]);
  assertEqual(boostBonusAfterSpotlight.get(userA.id), PROFILE_SPOTLIGHT_SCORE_BONUS, '...with the bigger spotlight bonus, not the boost one');

  // --- super_like: just an ordinary credit spend ------------------------
  const balanceBeforeSuperLike = (await db.creditBalance.findUnique({ where: { userId: userA.id } }))!.balance;
  const superLikeSpent = await spendCredits(userA.id, CREDIT_FEATURE_COSTS.super_like, 'feature_redeem:super_like');
  assertTrue(superLikeSpent, 'spendCredits succeeds for super_like');
  const balanceAfterSuperLike = (await db.creditBalance.findUnique({ where: { userId: userA.id } }))!.balance;
  assertEqual(balanceAfterSuperLike, balanceBeforeSuperLike - CREDIT_FEATURE_COSTS.super_like, 'super_like decrements the balance by its exact cost');

  // --- Free_Tier=true blocks every credit spend outright ----------------
  process.env.Free_Tier = 'true';
  const spendUnderFreeTier = await spendCredits(userA.id, 1, 'should_never_spend');
  assertTrue(!spendUnderFreeTier, 'spendCredits refuses while Free_Tier=true, even with a real balance');
  process.env.Free_Tier = 'false';

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
