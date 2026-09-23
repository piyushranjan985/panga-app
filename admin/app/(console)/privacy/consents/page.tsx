import Link from 'next/link';
import { requirePageAccess } from '@/lib/pageGuard';
import { db } from '@/lib/db';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import type { Prisma } from '@prisma/client';

const PURPOSES = ['ACCOUNT_ESSENTIAL', 'PRECISE_LOCATION', 'MARKETING_COMMUNICATIONS', 'ANALYTICS', 'THIRD_PARTY_SHARING'];

export default async function ConsentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePageAccess('privacy.consents.view');
  const sp = await searchParams;

  const where: Prisma.ConsentRecordWhereInput = {};
  const and: Prisma.ConsentRecordWhereInput[] = [];
  if (sp.purpose) and.push({ purpose: sp.purpose as never });
  if (sp.status) and.push({ status: sp.status as never });
  if (sp.userId) and.push({ userId: sp.userId });
  if (and.length > 0) where.AND = and;

  const [records, purposeSummary] = await Promise.all([
    db.consentRecord.findMany({
      where,
      include: { user: { include: { profile: { select: { displayName: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    db.consentRecord.groupBy({ by: ['purpose', 'status'], _count: true }),
  ]);

  return (
    <div>
      <PageHeader
        title="Consent Records"
        description="Purpose-tagged, versioned consent history. Append-only -- withdrawing consent inserts a new row rather than editing the granted one."
      />
      <div className="space-y-6 p-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {PURPOSES.map((p) => {
            const granted = purposeSummary.find((s) => s.purpose === p && s.status === 'GRANTED')?._count ?? 0;
            const withdrawn = purposeSummary.find((s) => s.purpose === p && s.status === 'WITHDRAWN')?._count ?? 0;
            return (
              <div key={p} className="rounded-card border border-border bg-surface p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-inkFaint">{p.replace(/_/g, ' ')}</p>
                <p className="mt-2 text-lg font-bold">{granted} <span className="text-xs font-normal text-inkSoft">granted</span></p>
                <p className="text-xs text-inkFaint">{withdrawn} withdrawn (all time)</p>
              </div>
            );
          })}
        </div>

        <form className="flex flex-wrap gap-2" method="get">
          <Select name="purpose" label="Any purpose" defaultValue={sp.purpose} options={PURPOSES} />
          <Select name="status" label="Any status" defaultValue={sp.status} options={['GRANTED', 'WITHDRAWN']} />
          <input
            name="userId"
            defaultValue={sp.userId ?? ''}
            placeholder="User ID"
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white">Filter</button>
        </form>

        {records.length === 0 ? (
          <EmptyState title="No consent records match" />
        ) : (
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-canvas text-left text-xs font-semibold uppercase tracking-wide text-inkFaint">
                <tr>
                  <th className="px-4 py-2.5">User</th>
                  <th className="px-4 py-2.5">Purpose</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Notice version</th>
                  <th className="px-4 py-2.5">Source</th>
                  <th className="px-4 py-2.5">Recorded</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-canvas">
                    <td className="px-4 py-2.5">
                      <Link href={`/users/${r.userId}`} className="font-semibold text-brand hover:underline">
                        {r.user.profile?.displayName ?? r.userId}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-inkSoft">{r.purpose.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2.5"><Badge tone={r.status === 'GRANTED' ? 'success' : 'default'}>{r.status}</Badge></td>
                    <td className="px-4 py-2.5 text-inkSoft">{r.noticeVersion}</td>
                    <td className="px-4 py-2.5 text-inkSoft">{r.source}</td>
                    <td className="px-4 py-2.5 text-inkSoft">{r.createdAt.toISOString().slice(0, 10)}</td>
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
        <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>
      ))}
    </select>
  );
}
