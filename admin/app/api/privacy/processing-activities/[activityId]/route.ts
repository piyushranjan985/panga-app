import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';

const bodySchema = z.object({ dpiaDocUrl: z.string().trim().max(500).optional() });

export async function PATCH(req: Request, { params }: { params: Promise<{ activityId: string }> }) {
  const guard = await requirePermission('privacy.processingActivities.manage');
  if ('error' in guard) return guard.error;
  const { admin } = guard;
  const { activityId } = await params;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const existing = await db.processingActivity.findUnique({ where: { id: activityId } });
  if (!existing) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  await db.processingActivity.update({ where: { id: activityId }, data: parsed.data });

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'privacy.processingActivity.update',
    category: 'privacy',
    targetType: 'ProcessingActivity',
    targetId: activityId,
    newValue: parsed.data,
    context: await getRequestContext(),
  });

  return NextResponse.json({ ok: true });
}
