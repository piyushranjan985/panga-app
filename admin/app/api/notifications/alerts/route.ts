import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';

const bodySchema = z.object({
  category: z.enum(['SECURITY', 'MODERATION', 'SLA_BREACH', 'SYSTEM', 'PAYMENT', 'VERIFICATION', 'PRIVACY', 'OUTAGE']),
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']).default('WARNING'),
  title: z.string().trim().min(1).max(200),
  detail: z.string().trim().max(2000).default(''),
  sourceType: z.string().trim().max(100).optional(),
  sourceId: z.string().trim().max(200).optional(),
});

// Most rows here come from "Log as alert" on a live-detected condition on
// the Notifications page (an overdue privacy request, an SLA-breached
// ticket, ...) rather than a background job -- this app has no scheduler,
// so persisting an alert is a deliberate admin action that turns a
// point-in-time signal into something trackable/acknowledgeable, not an
// automatic monitor.
export async function POST(req: Request) {
  const guard = await requirePermission('notifications.acknowledge');
  if ('error' in guard) return guard.error;
  const { admin } = guard;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const alert = await db.opsAlert.create({ data: parsed.data });

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'notifications.alert.create',
    category: 'system',
    targetType: 'OpsAlert',
    targetId: alert.id,
    newValue: parsed.data,
    context: await getRequestContext(),
  });

  return NextResponse.json({ alert });
}
