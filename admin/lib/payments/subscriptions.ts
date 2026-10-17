// admin/lib/payments/subscriptions.ts

import { db } from '@/lib/db';

export async function listSubscriptions(filter?: { status?: string }) {
  return db.subscription.findMany({
    where: filter?.status ? { status: filter.status as never } : undefined,
    include: { plan: true, user: { include: { profile: { select: { displayName: true } } } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
}

// Admin-triggered cancellation -- the subscription stays ACTIVE (and its
// entitlements keep working) until currentPeriodEnd, same as a
// self-service cancel would, unless `immediate` is set (used for a
// refund-triggered revoke). Gated by 'payments.subscriptions.override'
// with step-up, see admin/lib/rbac.ts.
export async function cancelSubscription(subscriptionId: string, immediate: boolean) {
  const data = immediate
    ? { status: 'CANCELLED' as const, cancelledAt: new Date(), cancelAtPeriodEnd: true }
    : { cancelAtPeriodEnd: true };
  return db.subscription.update({ where: { id: subscriptionId }, data });
}
