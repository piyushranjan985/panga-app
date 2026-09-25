import { requirePageAccess } from '@/lib/pageGuard';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';

// findmyVybe has no billing, subscription, or in-app-purchase system yet --
// no Subscription/Payment/Invoice model exists anywhere in the schema.
// Rather than fabricate revenue numbers or a payments table that doesn't
// back onto anything real, this page says so plainly and documents what
// it will show once monetization ships, per the spec's "no fabricated
// metrics" principle.
export default async function PaymentsPage() {
  await requirePageAccess('payments.view');

  return (
    <div>
      <PageHeader title="Payments & Subscriptions" description="Not yet applicable -- findmyVybe has no billing system yet." />
      <div className="p-8">
        <EmptyState
          title="No payments data to show"
          description="There is no Subscription, Payment, or Invoice model in the product yet -- findmyVybe doesn't charge users today. Once a billing provider (e.g. Razorpay/Stripe) and a subscription model are added to the schema, this page is where plan status, transaction history, refunds/chargebacks, and revenue reporting (payments.view / reporting.export) would live, wired the same way every other module here is: real Prisma queries, permission-gated, audit-logged."
        />
      </div>
    </div>
  );
}
