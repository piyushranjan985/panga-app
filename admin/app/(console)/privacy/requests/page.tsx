import Link from 'next/link';
import { requirePageAccess } from '@/lib/pageGuard';
import { db } from '@/lib/db';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import type { Prisma } from '@prisma/client';

const STATUS_TONE: Record<string, 'default' | 'success' | 'warning' | 'critical'> = {
  RECEIVED: 'warning',
  VERIFYING_IDENTITY: 'warning',
  IN_PROGRESS: 'info',
  ON_HOLD_LEGAL: 'critical',
  COMPLETED: 'success',
  REJECTED: 'default',
};

export default async function PrivacyRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePageAccess('privacy.view');
  const sp = await searchParams;

  const where: Prisma.PrivacyRequestWhereInput = {};
  const and: Prisma.PrivacyRequestWhereInput[] = [];
  if (sp.type) and.push({ type: sp.type as never });
  if (sp.overdue === '1') and.push({ dueAt: { lt: new Date() }, status: { in: ['RECEIVED', 'VERIFYING_IDENTITY', 'IN_PROGRESS'] } });
  else if (!sp.status) and.push({ status: { in: ['RECEIVED', 'VERIFYING_IDENTITY', 'IN_PROGRESS', 'ON_HOLD_LEGAL'] } });
  if (sp.status) and.push({ status: sp.status as never });
  if (and.length > 0) where.AND = and;

  const requests = await db.privacyRequest.findMany({
    where,
    include: { user: { include: { profile: { select: { displayName: true } } } }, handledBy: { select: { name: true } } },
    orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
    take: 100,
  });

  return (
    <div>
      <PageHeader title="Data-Principal Requests" description="Access, correction, deletion, grievance, portability, and consent-withdrawal requests." />
      <div className="p-8">
        <form className="mb-5 flex flex-wrap gap-2" method="get">
          <Select name="type" label="Any type" defaultValue={sp.type} options={['ACCESS', 'CORRECTION', 'DELETION', 'GRIEVANCE', 'PORTABILITY', 'CONSENT_WITHDRAWAL']} />
          <Select name="status" label="Open" defaultValue={sp.status} options={['RECEIVED', 'VERIFYING_IDENTITY', 'IN_PROGRESS', 'ON_HOLD_LEGAL', 'COMPLETED', 'REJECTED']} />
          <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white">Filter</button>
        </form>

        {requests.length === 0 ? (
          <EmptyState title="No requests" />
        ) : (
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-canvas text-left text-xs font-semibold uppercase tracking-wide text-inkFaint">
                <tr>
                  <th className="px-4 py-2.5">User</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Due</th>
                  <th className="px-4 py-2.5">Handler</th>
                  <th className="px-4 py-2.5">Received</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => {
                  const overdue = r.dueAt && r.dueAt < new Date() && !['COMPLETED', 'REJECTED'].includes(r.status);
                  return (
                    <tr key={r.id} className="border-b border-border last:border-0 hover:bg-canvas">
                      <td className="px-4 py-2.5">
                        <Link href={`/privacy/requests/${r.id}`} className="font-semibold text-brand hover:underline">
                          {r.user?.profile?.displayName ?? r.contactEmail ?? r.userId ?? 'Unknown'}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-inkSoft">{r.type}</td>
                      <td className="px-4 py-2.5"><Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge></td>
                      <td className="px-4 py-2.5">{r.dueAt ? <span className={overdue ? 'font-semibold text-critical' : 'text-inkSoft'}>{r.dueAt.toISOString().slice(0, 10)}</span> : '—'}</td>
                      <td className="px-4 py-2.5 text-inkSoft">{r.handledBy?.name ?? 'Unassigned'}</td>
                      <td className="px-4 py-2.5 text-inkSoft">{r.createdAt.toISOString().slice(0, 10)}</td>
                    </tr>
                  );
                })}
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
