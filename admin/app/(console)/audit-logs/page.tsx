import { requirePageAccess } from '@/lib/pageGuard';
import { db } from '@/lib/db';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import { hasPermission } from '@/lib/rbac';
import type { Prisma } from '@prisma/client';

const CATEGORIES = ['user', 'moderation', 'content', 'support', 'privacy', 'auth', 'config', 'payments', 'system'];

export default async function AuditLogsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const admin = await requirePageAccess('auditLogs.view');
  const sp = await searchParams;

  const where: Prisma.AuditLogEntryWhereInput = {};
  const and: Prisma.AuditLogEntryWhereInput[] = [];
  if (sp.category) and.push({ category: sp.category });
  if (sp.actorEmail) and.push({ actorEmail: { contains: sp.actorEmail, mode: 'insensitive' } });
  if (sp.action) and.push({ action: { contains: sp.action, mode: 'insensitive' } });
  if (sp.targetId) and.push({ targetId: sp.targetId });
  if (sp.from) and.push({ createdAt: { gte: new Date(sp.from) } });
  if (sp.to) and.push({ createdAt: { lte: new Date(sp.to) } });
  if (and.length > 0) where.AND = and;

  const entries = await db.auditLogEntry.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
  const canExport = hasPermission(admin.role, 'auditLogs.export');

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        description="Every sensitive read and mutation in this portal, in one append-only, tamper-resistant log -- see admin/lib/audit.ts."
        actions={canExport && <a href={`/api/audit/export?${new URLSearchParams(sp as Record<string, string>).toString()}`} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-inkSoft hover:bg-canvas">Export CSV</a>}
      />
      <div className="space-y-5 p-8">
        <form className="flex flex-wrap gap-2" method="get">
          <select name="category" defaultValue={sp.category || ''} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-inkSoft outline-none focus:border-brand">
            <option value="">Any category</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input name="actorEmail" defaultValue={sp.actorEmail ?? ''} placeholder="Actor email contains…" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
          <input name="action" defaultValue={sp.action ?? ''} placeholder="Action contains…" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
          <input name="targetId" defaultValue={sp.targetId ?? ''} placeholder="Target ID" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
          <input type="date" name="from" defaultValue={sp.from ?? ''} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
          <input type="date" name="to" defaultValue={sp.to ?? ''} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand" />
          <button type="submit" className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white">Filter</button>
        </form>

        {entries.length === 0 ? (
          <EmptyState title="No matching audit entries" />
        ) : (
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            <table className="w-full text-xs">
              <thead className="border-b border-border bg-canvas text-left font-semibold uppercase tracking-wide text-inkFaint">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Actor</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Target</th>
                  <th className="px-3 py-2">Reason</th>
                  <th className="px-3 py-2">IP</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-border align-top last:border-0 hover:bg-canvas">
                    <td className="whitespace-nowrap px-3 py-2 text-inkSoft">{e.createdAt.toISOString().slice(0, 19).replace('T', ' ')}</td>
                    <td className="px-3 py-2">{e.actorEmail}</td>
                    <td className="px-3 py-2 font-mono">{e.action}</td>
                    <td className="px-3 py-2 text-inkSoft">{e.category}</td>
                    <td className="px-3 py-2 text-inkSoft">{e.targetType ? `${e.targetType}:${e.targetId}` : '—'}</td>
                    <td className="max-w-xs truncate px-3 py-2 text-inkSoft">{e.reason ?? '—'}</td>
                    <td className="px-3 py-2 text-inkFaint">{e.ip ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-inkFaint">Showing the most recent {entries.length} matching entries.</p>
      </div>
    </div>
  );
}
