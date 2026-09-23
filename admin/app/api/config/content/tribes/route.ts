import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';

const bodySchema = z.object({
  slug: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(100),
  emoji: z.string().trim().max(8).default(''),
});

export async function POST(req: Request) {
  const guard = await requirePermission('config.propose');
  if ('error' in guard) return guard.error;
  const { admin } = guard;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const tribe = await db.tribe.create({ data: parsed.data }).catch(() => null);
  if (!tribe) return NextResponse.json({ error: 'A tribe with that slug already exists.' }, { status: 409 });

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'config.content.tribe.create',
    category: 'config',
    targetType: 'Tribe',
    targetId: tribe.id,
    newValue: parsed.data,
    context: await getRequestContext(),
  });

  return NextResponse.json({ tribe });
}
