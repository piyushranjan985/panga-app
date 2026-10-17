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
export type CreditFeatureKey = 'profile_boost' | 'super_like' | 'profile_spotlight' | 'assisted_shortlist_review';

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
  'assisted_shortlist_review',
];

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
