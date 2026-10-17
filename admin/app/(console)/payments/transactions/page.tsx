import Link from 'next/link';
import { requirePageAccess } from '@/lib/pageGuard';
import { hasPermission } from '@/lib/rbac';
import { db } from '@/lib/db';
import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import { formatInr } from '@/lib/payments/money';
import type { Prisma } from '@prisma/client';

const STATUS_TONE: Record<string, 'default' | 'success' | 'warning' | 'critical' | 'info'> = {
  CREATED: 'default',
  PENDING: 'info',
  SUCCEEDED: 'success',
  FAILED: 'critical',
  REFUNDED: 'warning',
};

export default async function PaymentsTransactionsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const admin = await requirePageAccess('payments.view');
  const canExport = hasPermission(admin.role, 'reporting.export');
  const { status } = await searchParams;

  const where: Prisma.TransactionWhereInput = status ? { status: status as never } : {};
  const transactions = await db.transaction.findMany({
    where,
    include: { plan: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return (
    <div>
      <PageHeader
        title="Transactions"
        description="Every checkout attempt -- not only successful ones -- so the funnel and the idempotency/out-of-order story are both reconstructable."
        actions={
          canExport ? (
            <a href={`/api/payments/transactions/export${status ? `?status=${status}` : ''}`} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-inkSoft hover:bg-canvas">
              Export CSV
            </a>
          ) : undefined
        }
      />
      <div className="p-8">
        <div className="mb-4 flex gap-2 text-xs">
          {['', 'CREATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED'].map((s) => (
            <Link
              key={s || 'all'}
              href={s ? `/payments/transactions?status=${s}` : '/payments/transactions'}
              className={`rounded-full px-3 py-1 font-semibold ${status === s || (!status && !s) ? 'bg-brand text-white' : 'border border-border text-inkSoft'}`}
            >
              {s || 'All'}
            </Link>
          ))}
        </div>

        {transactions.length === 0 ? (
          <EmptyState title="No transactions yet" description="They'll show up here the moment a checkout is attempted, mock or otherwise." />
        ) : (
          <div className="overflow-x-auto rounded-card border border-border">
            <table className="w-full text-sm">
              <thead className="bg-canvas text-left text-xs text-inkFaint">
                <tr>
                  <th className="px-4 py-2">Transaction</th>
                  <th className="px-4 py-2">Plan</th>
                  <th className="px-4 py-2">Gateway</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Total</th>
                  <th className="px-4 py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="px-4 py-2 font-mono text-xs">{t.id}</td>
                    <td className="px-4 py-2">{t.plan?.name ?? '—'}</td>
                    <td className="px-4 py-2">{t.gateway}</td>
                    <td className="px-4 py-2">
                      <Badge tone={STATUS_TONE[t.status] ?? 'default'}>{t.status}</Badge>
                    </td>
                    <td className="px-4 py-2 tabular-nums">{formatInr(t.totalInPaise)}</td>
                    <td className="px-4 py-2 text-xs text-inkFaint">{t.createdAt.toISOString().slice(0, 19).replace('T', ' ')}</td>
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
