import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';

const bodySchema = z.object({
  userId: z.string().trim().min(1),
  reason: z.string().trim().min(1).max(2000),
});

// Placing a hold is what blocks a DPDP DELETION request from completing
// (see app/api/privacy/requests/[requestId]/route.ts) -- step-up gated,
// same bar as banning a user.
export async function POST(req: Request) {
  const guard = await requirePermission('privacy.legalHolds.manage');
  if ('error' in guard) return guard.error;
  const { admin } = guard;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'A user and a reason are required.' }, { status: 400 });

  const user = await db.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true } });
  if (!user) return NextResponse.json({ error: 'No user with that ID.' }, { status: 404 });

  const existing = await db.legalHold.findFirst({ where: { userId: user.id, active: true } });
  if (existing) return NextResponse.json({ error: 'This user already has an active legal hold.' }, { status: 409 });

  const hold = await db.legalHold.create({
    data: { userId: user.id, reason: parsed.data.reason, requestedById: admin.id },
  });

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'privacy.legalHold.place',
    category: 'privacy',
    targetType: 'User',
    targetId: user.id,
    newValue: { reason: parsed.data.reason },
    reason: parsed.data.reason,
    context: await getRequestContext(),
  });

  return NextResponse.json({ hold });
}
