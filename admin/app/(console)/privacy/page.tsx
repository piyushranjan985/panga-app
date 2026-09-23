import Link from 'next/link';
import { requirePageAccess } from '@/lib/pageGuard';
import { db } from '@/lib/db';
import PageHeader from '@/components/PageHeader';
import StatTile from '@/components/StatTile';

export default async function PrivacyOverviewPage() {
  await requirePageAccess('privacy.view');

  const [openRequests, overdueRequests, openIncidents, activeLegalHolds, processors, retentionPolicies] = await Promise.all([
    db.privacyRequest.count({ where: { status: { in: ['RECEIVED', 'VERIFYING_IDENTITY', 'IN_PROGRESS'] } } }),
    db.privacyRequest.count({ where: { status: { in: ['RECEIVED', 'VERIFYING_IDENTITY', 'IN_PROGRESS'] }, dueAt: { lt: new Date() } } }),
    db.privacyIncident.count({ where: { status: { not: 'CLOSED' } } }),
    db.legalHold.count({ where: { active: true } }),
    db.dataProcessor.count({ where: { active: true } }),
    db.retentionPolicy.count(),
  ]);

  return (
    <div>
      <PageHeader
        title="Privacy & Compliance"
        description="DPDP Act 2023 / DPDP Rules 2025 -- consent, data-principal rights, breach handling, retention, and the processing register."
      />
      <div className="space-y-8 p-8">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="Open rights requests" value={openRequests} href="/privacy/requests" />
          <StatTile label="Overdue" value={overdueRequests} tone={overdueRequests > 0 ? 'critical' : 'default'} href="/privacy/requests?overdue=1" />
          <StatTile label="Open incidents" value={openIncidents} tone={openIncidents > 0 ? 'warning' : 'default'} href="/privacy/incidents" />
          <StatTile label="Active legal holds" value={activeLegalHolds} href="/privacy/legal-holds" />
          <StatTile label="Active data processors" value={processors} href="/privacy/processors" />
          <StatTile label="Retention policies" value={retentionPolicies} href="/privacy/retention" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NavCard href="/privacy/requests" title="Data-Principal requests" description="Access, correction, erasure, grievance, portability, consent withdrawal." />
          <NavCard href="/privacy/consents" title="Consent records" description="Purpose-tagged, versioned consent history per user." />
          <NavCard href="/privacy/incidents" title="Privacy incidents" description="Breach assessment, containment, and Data Protection Board notification tracking." />
          <NavCard href="/privacy/legal-holds" title="Legal holds" description="Holds that block a deletion request until released." />
          <NavCard href="/privacy/processors" title="Data processors" description="Vendor register -- who else touches user data, and why." />
          <NavCard href="/privacy/retention" title="Retention policies" description="Configurable retention per data category." />
          <NavCard href="/privacy/processing-activities" title="Processing activities" description="The record-of-processing inventory." />
        </div>

        <p className="max-w-2xl text-xs text-inkFaint">
          This is workflow tooling for a compliance/privacy team to operate against India&apos;s DPDP Act 2023 and
          the notified DPDP Rules 2025 (commencing in phases) -- it is not a legal opinion. See
          admin/docs/DPDP_COMPLIANCE.md for what still needs counsel sign-off (e.g. Consent Manager integration,
          exact Board notification timelines) before this is relied on for a real compliance deadline.
        </p>
      </div>
    </div>
  );
}

function NavCard({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link href={href} className="rounded-card border border-border bg-surface p-4 hover:border-brand/40">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-inkSoft">{description}</p>
    </Link>
  );
}
