// lib/payments/entitlements.ts
//
// Entitlements are computed fresh on every call, never cached on the
// User/Profile row -- Free_Tier is checked FIRST and short-circuits
// everything else, so a stale "isPremium" flag can never survive a
// Free_Tier flip. See docs/PAYMENTS.md.

import { db } from '@/lib/db';
import { isFreeTier } from './flags';
import { ALL_FEATURE_KEYS, type FeatureKey } from './types';

export interface Entitlements {
  freeTier: boolean;
  activePlanSlug: string | null;
  features: Record<FeatureKey, boolean>;
  creditBalance: number;
}

function allFeaturesOff(): Record<FeatureKey, boolean> {
  return Object.fromEntries(ALL_FEATURE_KEYS.map((k) => [k, false])) as Record<FeatureKey, boolean>;
}

export async function getEntitlements(userId: string): Promise<Entitlements> {
  if (isFreeTier()) {
    // Free_Tier short-circuits everything else -- no subscription lookup,
    // no credit lookup, regardless of what history a user has.
    return { freeTier: true, activePlanSlug: null, features: allFeaturesOff(), creditBalance: 0 };
  }

  const [subscription, credit] = await Promise.all([
    db.subscription.findFirst({
      where: { userId, status: 'ACTIVE', currentPeriodEnd: { gt: new Date() } },
      include: { plan: true },
      orderBy: { currentPeriodEnd: 'desc' },
    }),
    db.creditBalance.findUnique({ where: { userId } }),
  ]);

  if (!subscription) {
    return { freeTier: false, activePlanSlug: null, features: allFeaturesOff(), creditBalance: credit?.balance ?? 0 };
  }

  const features = allFeaturesOff();
  const grantedFeatures = (subscription.plan.features ?? {}) as Partial<Record<FeatureKey, boolean>>;
  for (const key of ALL_FEATURE_KEYS) {
    if (grantedFeatures[key]) features[key] = true;
  }

  return { freeTier: false, activePlanSlug: subscription.plan.slug, features, creditBalance: credit?.balance ?? 0 };
}

export async function hasFeature(userId: string, feature: FeatureKey): Promise<boolean> {
  const entitlements = await getEntitlements(userId);
  return entitlements.features[feature] === true;
}

// Spends credits for a one-off CreditFeatureKey action (boost, super
// like, profile spotlight, assisted shortlist review). Returns false
// (never throws) on insufficient balance or while Free_Tier is on -- the
// caller decides how to surface that to the user.
export async function spendCredits(userId: string, amount: number, reason: string): Promise<boolean> {
  if (isFreeTier()) return false; // Free_Tier never has a credit balance to spend
  if (amount <= 0) return false;
  return db.$transaction(async (tx) => {
    const balance = await tx.creditBalance.findUnique({ where: { userId } });
    if (!balance || balance.balance < amount) return false;
    await tx.creditBalance.update({ where: { userId }, data: { balance: { decrement: amount } } });
    await tx.creditLedgerEntry.create({ data: { userId, delta: -amount, reason } });
    return true;
  });
}
