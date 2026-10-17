import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';
import { setPlanActive } from '@/lib/payments/plans';

const bodySchema = z.object({ isActive: z.boolean() });

// Activate/deactivate an existing plan version in place -- the ONE field
// on PaymentPlan this route is allowed to touch after creation. Pricing/
// features themselves are immutable once created; change those via a new
// version (POST /api/payments/plans) instead.
export async function PATCH(req: Request, { params }: { params: Promise<{ planId: string }> }) {
  const guard = await requirePermission('payments.manage');
  if ('error' in guard) return guard.error;
  const { admin } = guard;

  const { planId } = await params;
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const before = await db.paymentPlan.findUnique({ where: { id: planId } });
  if (!before) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const plan = await setPlanActive(planId, parsed.data.isActive);

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: parsed.data.isActive ? 'payments.plan.activate' : 'payments.plan.deactivate',
    category: 'payments',
    targetType: 'PaymentPlan',
    targetId: plan.id,
    previousValue: { isActive: before.isActive },
    newValue: { isActive: plan.isActive },
    context: await getRequestContext(),
  });

  return NextResponse.json({ plan });
}
