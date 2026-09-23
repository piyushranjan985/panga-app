import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';

const bodySchema = z.object({ reason: z.string().trim().max(2000).optional() });

export async function PATCH(req: Request, { params }: { params: Promise<{ holdId: string }> }) {
  const guard = await requirePermission('privacy.legalHolds.manage');
  if ('error' in guard) return guard.error;
  const { admin } = guard;
  const { holdId } = await params;

  const json = await req.json().catch(() => ({}));
  bodySchema.safeParse(json); // reason is optional and only used for the audit trail

  const existing = await db.legalHold.findUnique({ where: { id: holdId } });
  if (!existing) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (!existing.active) return NextResponse.json({ error: 'This hold is already released.' }, { status: 400 });

  await db.legalHold.update({ where: { id: holdId }, data: { active: false, releasedAt: new Date() } });

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'privacy.legalHold.release',
    category: 'privacy',
    targetType: 'User',
    targetId: existing.userId ?? undefined,
    previousValue: { active: true },
    newValue: { active: false },
    reason: json?.reason,
    context: await getRequestContext(),
  });

  return NextResponse.json({ ok: true });
}
