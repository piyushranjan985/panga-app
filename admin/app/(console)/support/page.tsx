import Link from 'next/link';
import { requirePageAccess } from '@/lib/pageGuard';
import { db } from '@/lib/db';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import type { Prisma } from '@prisma/client';

const STATUS_TONE: Record<string, 'default' | 'success' | 'warning' | 'critical'> = {
  OPEN: 'warning',
  IN_PROGRESS: 'info',
  WAITING_ON_USER: 'default',
  ESCALATED: 'critical',
  RESOLVED: 'success',
  CLOSED: 'default',
};

export default async function SupportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePageAccess('support.view');
  const sp = await searchParams;

  const where: Prisma.SupportTicketWhereInput = {};
  where.status = sp.status ? (sp.status as never) : { in: ['OPEN', 'IN_PROGRESS', 'WAITING_ON_USER', 'ESCALATED'] };
  if (sp.priority) where.priority = sp.priority as never;

  const tickets = await db.supportTicket.findMany({
    where,
    include: { user: { include: { profile: { select: { displayName: true } } } }, assignee: { select: { name: true } } },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    take: 100,
  });

  return (
    <div>
      <PageHeader title="Support" description="Tickets from VybeHelp escalations and direct contact." />
      <div className="p-8">
        <form className="mb-5 flex flex-wrap gap-2" method="get">
          <Select name="status" label="Open queue" defaultValue={sp.status} options={['OPEN', 'IN_PROGRESS', 'WAITING_ON_USER', 'ESCALATED', 'RESOLVED', 'CLOSED']} />
          <Select name="priority" label="Any priority" defaultValue={sp.priority} options={['LOW', 'NORMAL', 'HIGH', 'URGENT']} />
          <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white">Filter</button>
        </form>

        {tickets.length === 0 ? (
          <EmptyState title="No tickets" description="Nothing matches these filters." />
        ) : (
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-canvas text-left text-xs font-semibold uppercase tracking-wide text-inkFaint">
                <tr>
                  <th className="px-4 py-2.5">Subject</th>
                  <th className="px-4 py-2.5">User</th>
                  <th className="px-4 py-2.5">Category</th>
                  <th className="px-4 py-2.5">Channel</th>
                  <th className="px-4 py-2.5">Priority</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Assignee</th>
                  <th className="px-4 py-2.5">Opened</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-0 hover:bg-canvas">
                    <td className="px-4 py-2.5">
                      <Link href={`/support/${t.id}`} className="font-semibold text-brand hover:underline">{t.subject}</Link>
                    </td>
                    <td className="px-4 py-2.5 text-inkSoft">{t.user?.profile?.displayName ?? t.contactEmail ?? t.contactPhone ?? 'Guest'}</td>
                    <td className="px-4 py-2.5 text-inkSoft">{t.category}</td>
                    <td className="px-4 py-2.5 text-inkSoft">{t.channel === 'VYBEHELP_ESCALATION' ? 'VybeHelp 💬' : t.channel}</td>
                    <td className="px-4 py-2.5"><Badge tone={t.priority === 'URGENT' || t.priority === 'HIGH' ? 'critical' : 'default'}>{t.priority}</Badge></td>
                    <td className="px-4 py-2.5"><Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge></td>
                    <td className="px-4 py-2.5 text-inkSoft">{t.assignee?.name ?? 'Unassigned'}</td>
                    <td className="px-4 py-2.5 text-inkSoft">{t.createdAt.toISOString().slice(0, 10)}</td>
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
