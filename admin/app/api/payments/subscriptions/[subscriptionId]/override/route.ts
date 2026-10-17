import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';
import { cancelSubscription } from '@/lib/payments/subscriptions';

const bodySchema = z.object({
  action: z.enum(['cancelAtPeriodEnd', 'cancelImmediately']),
  reason: z.string().trim().min(1).max(2000),
});

// Gated by payments.subscriptions.override, which lib/rbac.ts's
// STEP_UP_REQUIRED also demands a fresh step-up for -- this changes a
// real subscriber's access, so it gets the same bar as suspend/ban, not
// the lighter bar plan editing gets.
export async function POST(req: Request, { params }: { params: Promise<{ subscriptionId: string }> }) {
  const guard = await requirePermission('payments.subscriptions.override');
  if ('error' in guard) return guard.error;
  const { admin } = guard;

  const { subscriptionId } = await params;
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const before = await db.subscription.findUnique({ where: { id: subscriptionId } });
  if (!before) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const subscription = await cancelSubscription(subscriptionId, parsed.data.action === 'cancelImmediately');

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: `payments.subscription.${parsed.data.action}`,
    category: 'payments',
    targetType: 'Subscription',
    targetId: subscriptionId,
    previousValue: { status: before.status, cancelAtPeriodEnd: before.cancelAtPeriodEnd },
    newValue: { status: subscription.status, cancelAtPeriodEnd: subscription.cancelAtPeriodEnd },
    reason: parsed.data.reason,
    context: await getRequestContext(),
  });

  return NextResponse.json({ subscription });
}
