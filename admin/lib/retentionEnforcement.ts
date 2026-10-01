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
