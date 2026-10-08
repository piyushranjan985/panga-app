import { db } from '@/lib/db';

// Single source of truth for the DPDP/IT-Rules deletion-retention floor --
// used by both the manual completion guard (privacy/requests/[requestId])
// and the automatic purge job (api/cron/retention-purge), so they can
// never drift apart on how many days an account must sit soft-deleted
// before anonymizeUserAccount is allowed to run.
//
// The dataCategory name below must match a RetentionPolicy row exactly
// (see admin/scripts/seed-admin.ts) for an admin to actually control the
// figure and the auto-delete toggle from the Retention Policies page --
// absent that row (e.g. a fresh DB before seeding), DEFAULT_DELETION_RETENTION_DAYS
// is the floor, matching what app/api/me/delete/route.ts and
// app/privacy/page.tsx already tell users to expect. NOT LEGAL ADVICE --
// this figure (and whether 180 is still the right number) should be
// confirmed with counsel; see the same disclaimer on app/api/me/delete/route.ts.
export const DELETION_RETENTION_CATEGORY = 'Deleted-account data (pre-anonymization hold)';
export const DEFAULT_DELETION_RETENTION_DAYS = 180;

export async function getDeletionRetentionPolicy(): Promise<{ floorDays: number; autoDeleteEnabled: boolean }> {
  const policy = await db.retentionPolicy.findUnique({ where: { dataCategory: DELETION_RETENTION_CATEGORY } });
  return {
    floorDays: policy?.retentionDays ?? DEFAULT_DELETION_RETENTION_DAYS,
    autoDeleteEnabled: policy?.autoDeleteEnabled ?? false,
  };
}

export function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

export function retentionEligibleOn(deletedAt: Date, floorDays: number): Date {
  return new Date(deletedAt.getTime() + floorDays * 86_400_000);
}

// ---------------------------------------------------------------------------
// Expired/unmatched swipes -- see docs/DATA_RETENTION.md (main app) S1/S2
// and admin/docs/DPDP_COMPLIANCE.md S7. Same "row exists, autoDeleteEnabled
// starts false" shape as the deletion-retention policy above: the purge
// logic is fully built and wired into the cron job below, but it stays a
// no-op until a human flips the toggle on the Retention Policies page,
// since this one has a real, disclosed product-behavior consequence (a
// profile you passed on, or an unreciprocated like, becomes swipeable
// again once its row ages out) that deserves a deliberate decision, not a
// silent default-on.
export const SWIPE_RETENTION_CATEGORY = 'Expired/unmatched swipes';
export const DEFAULT_SWIPE_RETENTION_DAYS = 180;

export async function getSwipeRetentionPolicy(): Promise<{ floorDays: number; autoDeleteEnabled: boolean }> {
  const policy = await db.retentionPolicy.findUnique({ where: { dataCategory: SWIPE_RETENTION_CATEGORY } });
  return {
    floorDays: policy?.retentionDays ?? DEFAULT_SWIPE_RETENTION_DAYS,
    autoDeleteEnabled: policy?.autoDeleteEnabled ?? false,
  };
}

// ---------------------------------------------------------------------------
// Ended-match conversation messages -- same deliberate off-by-default
// shape. Scoped to matches that have actually ended (Match.unmatchedAt
// set), measured from unmatchedAt, NOT from each message's own createdAt
// -- an active, ongoing match's history is never touched by this policy
// no matter how old, matching how every competitor researched in
// docs/DATA_RETENTION.md (main app) treats it: retain while the
// relationship is live, purge only after it's explicitly over, with a
// grace window first (90 days here, matching Tinder's and Hinge's own
// published ~3-month post-closure safety-retention window) in case a
// report or dispute needs the content.
export const MESSAGE_RETENTION_CATEGORY = 'Ended-match conversation messages';
export const DEFAULT_MESSAGE_RETENTION_DAYS = 90;

export async function getMessageRetentionPolicy(): Promise<{ floorDays: number; autoDeleteEnabled: boolean }> {
  const policy = await db.retentionPolicy.findUnique({ where: { dataCategory: MESSAGE_RETENTION_CATEGORY } });
  return {
    floorDays: policy?.retentionDays ?? DEFAULT_MESSAGE_RETENTION_DAYS,
    autoDeleteEnabled: policy?.autoDeleteEnabled ?? false,
  };
}
