// lib/payments/types.ts
//
// Entitlement keys this payments domain can grant. This list IS the
// enforcement of "never monetize safety features": every safety-relevant
// capability (identity verification, reporting, blocking, moderation
// visibility, account recovery, force logout) simply never appears here,
// so there is no code path that could gate it behind a paid plan. See
// SAFETY_FEATURES_NEVER_MONETIZED below for the explicit (documentation-
// only) list of what that guarantee covers.

// Subscription-gated (on/off) features -- granted for as long as a
// Subscription is ACTIVE, see lib/payments/entitlements.ts.
export type FeatureKey =
  | 'unlimited_swipes'
  | 'see_who_liked_you'
  | 'advanced_filters'
  | 'rewind_last_swipe'
  | 'priority_placement'
  | 'extra_vybe_vouch_invites'
  | 'read_receipts';

export const ALL_FEATURE_KEYS: FeatureKey[] = [
  'unlimited_swipes',
  'see_who_liked_you',
  'advanced_filters',
  'rewind_last_swipe',
  'priority_placement',
  'extra_vybe_vouch_invites',
  'read_receipts',
];

// Credit-consuming (one-off) features -- spent from CreditBalance, see
// lib/payments/entitlements.ts's spendCredits(). These are what the
// CREDIT_PACK side of the hybrid pricing model buys.
export type CreditFeatureKey = 'profile_boost' | 'super_like' | 'profile_spotlight';

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  unlimited_swipes: 'Unlimited swipes',
  see_who_liked_you: 'See who liked you',
  advanced_filters: 'Advanced search filters',
  rewind_last_swipe: 'Rewind last swipe',
  priority_placement: 'Priority placement in discovery',
  extra_vybe_vouch_invites: 'Extra Vybe Vouch invites',
  read_receipts: 'Read receipts',
};

export const ALL_CREDIT_FEATURE_KEYS: CreditFeatureKey[] = [
  'profile_boost',
  'super_like',
  'profile_spotlight',
];

// Credit cost (in CreditBalance units, the same unit CREDIT_PACK plans
// sell -- see scripts/seed-payment-plans.ts) for each one-off action.
// Starter defaults, same "defensible band, not final sign-off numbers"
// caveat as the plan prices themselves -- see that script's file
// comment. Centralized here (not hardcoded in each route) so the
// /upgrade page and the spending routes can never quote two different
// prices for the same action.
export const CREDIT_FEATURE_COSTS: Record<CreditFeatureKey, number> = {
  super_like: 1,
  profile_boost: 3,
  profile_spotlight: 8,
};

export const CREDIT_FEATURE_LABELS: Record<CreditFeatureKey, string> = {
  super_like: 'Super Vybe',
  profile_boost: 'Profile Boost',
  profile_spotlight: 'Profile Spotlight',
};

// Documentation only -- enforced by these never being FeatureKeys/
// CreditFeatureKeys above, not by a runtime check. Listed explicitly so
// a future change to this file can be reviewed against it.
export const SAFETY_FEATURES_NEVER_MONETIZED = [
  'identity_verification',
  'reporting_and_blocking',
  'content_moderation',
  'account_recovery',
  'force_logout',
  'data_privacy_rights',
] as const;
