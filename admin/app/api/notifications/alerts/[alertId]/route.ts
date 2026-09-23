import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';

export async function PATCH(_req: Request, { params }: { params: Promise<{ alertId: string }> }) {
  const guard = await requirePermission('notifications.acknowledge');
  if ('error' in guard) return guard.error;
  const { admin } = guard;
  const { alertId } = await params;

  const existing = await db.opsAlert.findUnique({ where: { id: alertId } });
  if (!existing) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (existing.acknowledgedAt) return NextResponse.json({ error: 'Already acknowledged.' }, { status: 400 });

  await db.opsAlert.update({ where: { id: alertId }, data: { acknowledgedById: admin.id, acknowledgedAt: new Date() } });

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'notifications.alert.acknowledge',
    category: 'system',
    targetType: 'OpsAlert',
    targetId: alertId,
    context: await getRequestContext(),
  });

  return NextResponse.json({ ok: true });
}
