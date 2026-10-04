/**
 * SLA defaults for newly created moderation cases, keyed by severity.
 *
 * Before this, ModerationCase.slaDueAt was only ever set by
 * admin/scripts/seed-admin.ts's demo data -- every real case created
 * through actual app usage (lib/safety/moderateAndUpload.ts,
 * lib/safety/identityVerification.ts) had slaDueAt: null. That meant the
 * admin portal's "Moderation case past SLA" live signal
 * (admin/lib/liveSignals.ts) and the queue's SLA badge could never fire
 * for anything real -- only for the seeded rows. This fixes that at the
 * source: every new case now gets a real due-by time based on severity.
 */
export function moderationSlaDueAt(severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'): Date {
  const hours = severity === 'CRITICAL' ? 4 : severity === 'HIGH' ? 12 : severity === 'MEDIUM' ? 48 : 168;
  return new Date(Date.now() + hours * 3600 * 1000);
}
