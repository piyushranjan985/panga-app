import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';

const bodySchema = z.object({
  dataCategory: z.string().trim().min(1).max(200),
  retentionDays: z.number().int().positive(),
  autoDeleteEnabled: z.boolean().default(false),
  legalBasis: z.string().trim().max(1000).default(''),
});

export async function POST(req: Request) {
  const guard = await requirePermission('privacy.retention.manage');
  if ('error' in guard) return guard.error;
  const { admin } = guard;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const policy = await db.retentionPolicy.upsert({
    where: { dataCategory: parsed.data.dataCategory },
    create: { ...parsed.data, lastReviewedAt: new Date() },
    update: { ...parsed.data, lastReviewedAt: new Date() },
  });

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'privacy.retention.upsert',
    category: 'privacy',
    targetType: 'RetentionPolicy',
    targetId: policy.id,
    newValue: parsed.data,
    context: await getRequestContext(),
  });

  return NextResponse.json({ policy });
}
