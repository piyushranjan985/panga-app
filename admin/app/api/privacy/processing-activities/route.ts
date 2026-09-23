import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';

const bodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  purpose: z.string().trim().min(1).max(1000),
  dataCategories: z.array(z.string()).default([]),
  legalBasis: z.string().trim().min(1).max(500),
  dataSubjects: z.string().trim().max(200).default('App users (Data Principals)'),
  recipients: z.array(z.string()).default([]),
  retentionCategoryRef: z.string().trim().max(200).optional(),
  crossBorderTransfer: z.boolean().default(false),
  dpiaRequired: z.boolean().default(false),
});

// The "record of processing activities" DPDP (and most privacy regimes)
// expect a controller to maintain -- documentation rows a compliance
// officer fills in, not something derived automatically from the schema.
export async function POST(req: Request) {
  const guard = await requirePermission('privacy.processingActivities.manage');
  if ('error' in guard) return guard.error;
  const { admin } = guard;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const activity = await db.processingActivity.create({ data: { ...parsed.data, ownerId: admin.id } });

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'privacy.processingActivity.create',
    category: 'privacy',
    targetType: 'ProcessingActivity',
    targetId: activity.id,
    newValue: parsed.data,
    context: await getRequestContext(),
  });

  return NextResponse.json({ activity });
}
