import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';

const bodySchema = z.object({ active: z.boolean() });

export async function PATCH(req: Request, { params }: { params: Promise<{ processorId: string }> }) {
  const guard = await requirePermission('privacy.processors.manage');
  if ('error' in guard) return guard.error;
  const { admin } = guard;
  const { processorId } = await params;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const existing = await db.dataProcessor.findUnique({ where: { id: processorId } });
  if (!existing) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  await db.dataProcessor.update({ where: { id: processorId }, data: { active: parsed.data.active } });

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: parsed.data.active ? 'privacy.processor.activate' : 'privacy.processor.deactivate',
    category: 'privacy',
    targetType: 'DataProcessor',
    targetId: processorId,
    previousValue: { active: existing.active },
    newValue: { active: parsed.data.active },
    context: await getRequestContext(),
  });

  return NextResponse.json({ ok: true });
}
