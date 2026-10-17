import Link from 'next/link';
import { requirePageAccess } from '@/lib/pageGuard';
import { db } from '@/lib/db';
import PageHeader from '@/components/PageHeader';
import StatTile from '@/components/StatTile';
import Badge from '@/components/Badge';
import { getPaymentsAccess } from '@/lib/payments/flags';
import { formatInr } from '@/lib/payments/money';

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export default async function PaymentsOverviewPage() {
  await requirePageAccess('payments.view');

  const access = getPaymentsAccess();
  const thirtyDaysAgo = daysAgo(30);

  const [activeSubscriptions, succeeded30d, failed30d, revenue30d, activePlanCount] = await Promise.all([
    db.subscription.count({ where: { status: 'ACTIVE' } }),
    db.transaction.count({ where: { status: 'SUCCEEDED', createdAt: { gte: thirtyDaysAgo } } }),
    db.transaction.count({ where: { status: 'FAILED', createdAt: { gte: thirtyDaysAgo } } }),
    db.transaction.aggregate({ where: { status: 'SUCCEEDED', createdAt: { gte: thirtyDaysAgo } }, _sum: { totalInPaise: true } }),
    db.paymentPlan.count({ where: { isActive: true } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Plans, subscriptions, transactions, and GST reporting for FindMyVybe's mock-mode payment system."
      />
      <div className="space-y-8 p-8">
        <div
          className={`rounded-card border p-4 text-sm ${
            access.freeTier ? 'border-info/30 bg-infoSoft' : access.liveGatewayActive ? 'border-critical/30 bg-criticalSoft' : 'border-warning/30 bg-warningSoft'
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold">Current environment:</span>
            <Badge tone={access.freeTier ? 'info' : 'warning'}>Free_Tier = {String(access.freeTier)}</Badge>
            <Badge tone={access.paymentMode === 'live' ? 'critical' : 'default'}>PAYMENT_MODE = {access.paymentMode}</Badge>
            <Badge tone={access.liveGatewayActive ? 'critical' : 'success'}>
              {access.liveGatewayActive ? 'LIVE -- real money can move' : 'No real money can move'}
            </Badge>
          </div>
          <p className="mt-2 text-inkSoft">
            {access.freeTier
              ? 'Every user is on the free tier right now, regardless of history. Checkout is not reachable. These are plain server environment variables -- nothing in this admin portal can override them.'
              : access.liveGatewayActive
                ? 'Free_Tier is off, PAYMENT_MODE is live, and live activation is explicitly confirmed -- real payments can be taken. Confirm this is intentional.'
                : 'Free_Tier is off, but payments are still mock-only -- no real gateway call is possible until PAYMENT_MODE=live and LIVE_PAYMENTS_CONFIRMED=true are both set as environment variables and redeployed.'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatTile label="Active plans" value={activePlanCount} href="/payments/plans" />
          <StatTile label="Active subscriptions" value={activeSubscriptions} href="/payments/subscriptions" />
          <StatTile label="Succeeded (30d)" value={succeeded30d} tone="success" href="/payments/transactions" />
          <StatTile label="Failed (30d)" value={failed30d} tone={failed30d > 0 ? 'warning' : 'default'} href="/payments/transactions?status=FAILED" />
          <StatTile label="Revenue (30d)" value={formatInr(revenue30d._sum.totalInPaise ?? 0)} detail="Sum of totalInPaise on SUCCEEDED transactions, last 30 days. Mock revenue while PAYMENT_MODE=mock." />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NavCard href="/payments/plans" title="Plans & pricing" description="Versioned plans across Dating, Serious Relationship, and Matchmaking -- admin-configurable, never hardcoded." />
          <NavCard href="/payments/transactions" title="Transactions" description="Every checkout attempt, searchable and exportable." />
          <NavCard href="/payments/subscriptions" title="Subscriptions" description="Per-user subscription state and manual overrides." />
          <NavCard href="/payments/reports" title="Reports & compliance" description="GST summary and promo-code usage, exportable for filing." />
          <NavCard href="/payments/gateway" title="Gateway configuration" description="Planning-only gateway settings, plus the live Free_Tier/PAYMENT_MODE banner." />
        </div>

        <p className="max-w-2xl text-xs text-inkFaint">
          Everything here is mock-mode only until PAYMENT_MODE=live and LIVE_PAYMENTS_CONFIRMED=true are both set as
          server environment variables and Free_Tier is false -- see docs/PAYMENTS.md. No gateway (Razorpay,
          Cashfree, or PayU) has a live integration implemented in this build.
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
