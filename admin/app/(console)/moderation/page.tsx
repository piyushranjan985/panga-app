import Link from 'next/link';
import { requirePageAccess } from '@/lib/pageGuard';
import { db } from '@/lib/db';
import { hasPermission } from '@/lib/rbac';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import type { Prisma } from '@prisma/client';

const SEVERITY_TONE: Record<string, 'default' | 'success' | 'warning' | 'critical'> = {
  LOW: 'default',
  MEDIUM: 'warning',
  HIGH: 'warning',
  CRITICAL: 'critical',
};

export default async function ModerationPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const admin = await requirePageAccess('moderation.view');
  const sp = await searchParams;

  const where: Prisma.ModerationCaseWhereInput = {};
  where.status = sp.status ? (sp.status as never) : { in: ['OPEN', 'IN_REVIEW', 'ESCALATED'] };
  if (sp.severity) where.severity = sp.severity as never;
  if (sp.category) where.category = sp.category;
  if (sp.mine === '1') where.assigneeId = admin.id;

  const cases = await db.moderationCase.findMany({
    where,
    include: { subjectUser: { include: { profile: { select: { displayName: true } } } }, assignee: { select: { name: true } } },
    orderBy: [{ severity: 'desc' }, { createdAt: 'asc' }],
    take: 100,
  });

  const canViewRisk = hasPermission(admin.role, 'moderation.viewRiskScore');

  return (
    <div>
      <PageHeader title="Moderation" description="Trust & Safety case queue -- reports, automated flags, and content reviews." />
      <div className="p-8">
        <form className="mb-5 flex flex-wrap gap-2" method="get">
          <Select name="status" label="Open + In review + Escalated" defaultValue={sp.status} options={['OPEN', 'IN_REVIEW', 'ESCALATED', 'RESOLVED', 'DISMISSED']} />
          <Select name="severity" label="Any severity" defaultValue={sp.severity} options={['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']} />
          <Select
            name="category"
            label="Any category"
            defaultValue={sp.category}
            options={['harassment', 'scam_fraud', 'fake_catfish', 'underage', 'sexual_content', 'threats_blackmail', 'spam', 'suspicious_behavior', 'photo_violation', 'bio_violation', 'message_violation', 'other']}
          />
          <label className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-inkSoft">
            <input type="checkbox" name="mine" value="1" defaultChecked={sp.mine === '1'} /> Assigned to me
          </label>
          <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white">Filter</button>
        </form>

        {cases.length === 0 ? (
          <EmptyState title="Queue is empty" description="No cases match these filters." />
        ) : (
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-canvas text-left text-xs font-semibold uppercase tracking-wide text-inkFaint">
                <tr>
                  <th className="px-4 py-2.5">Subject</th>
                  <th className="px-4 py-2.5">Category</th>
                  <th className="px-4 py-2.5">Source</th>
                  <th className="px-4 py-2.5">Severity</th>
                  {canViewRisk && <th className="px-4 py-2.5">Risk</th>}
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Assignee</th>
                  <th className="px-4 py-2.5">Opened</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0 hover:bg-canvas">
                    <td className="px-4 py-2.5">
                      <Link href={`/moderation/${c.id}`} className="font-semibold text-brand hover:underline">
                        {c.subjectUser.profile?.displayName ?? c.subjectUserId}
                      </Link>
                      {c.isRepeatOffender && <span className="ml-1"><Badge tone="critical">Repeat</Badge></span>}
                    </td>
                    <td className="px-4 py-2.5 text-inkSoft">{c.category}</td>
                    <td className="px-4 py-2.5 text-inkSoft">{c.sourceType.replace('_', ' ')}</td>
                    <td className="px-4 py-2.5"><Badge tone={SEVERITY_TONE[c.severity]}>{c.severity}</Badge></td>
                    {canViewRisk && <td className="px-4 py-2.5 text-inkSoft tabular-nums">{c.riskScore != null ? c.riskScore.toFixed(2) : '—'}</td>}
                    <td className="px-4 py-2.5"><Badge>{c.status}</Badge></td>
                    <td className="px-4 py-2.5 text-inkSoft">{c.assignee?.name ?? 'Unassigned'}</td>
                    <td className="px-4 py-2.5 text-inkSoft">{c.createdAt.toISOString().slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Select({ name, label, options, defaultValue }: { name: string; label: string; options: string[]; defaultValue?: string }) {
  return (
    <select name={name} defaultValue={defaultValue || ''} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-inkSoft outline-none focus:border-brand">
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}
