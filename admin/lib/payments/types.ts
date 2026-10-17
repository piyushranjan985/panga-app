// admin/lib/payments/types.ts -- duplicate of the root app's
// lib/payments/types.ts FeatureKey list, used by the plan-editing form so
// an admin can only ever grant a feature that's actually wired into
// entitlement checks (and, implicitly, never one of the safety features
// that deliberately never appear in this list -- see the root file's
// SAFETY_FEATURES_NEVER_MONETIZED comment for the full rationale).

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

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  unlimited_swipes: 'Unlimited swipes',
  see_who_liked_you: 'See who liked you',
  advanced_filters: 'Advanced search filters',
  rewind_last_swipe: 'Rewind last swipe',
  priority_placement: 'Priority placement in discovery',
  extra_vybe_vouch_invites: 'Extra Vybe Vouch invites',
  read_receipts: 'Read receipts',
};
