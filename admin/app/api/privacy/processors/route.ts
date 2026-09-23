import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';

const bodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  purpose: z.string().trim().min(1).max(500),
  dataCategories: z.array(z.string()).default([]),
  country: z.string().trim().min(1).max(100).default('India'),
  contractRef: z.string().trim().max(200).optional(),
  dpaSignedAt: z.string().optional(),
});

// Vendor register -- who else touches user data (SMS/OTP gateway, KYC
// vendor, hosting, blob storage, ...) and why. Not step-up-gated: it's a
// documentation register, not an enforcement action.
export async function POST(req: Request) {
  const guard = await requirePermission('privacy.processors.manage');
  if ('error' in guard) return guard.error;
  const { admin } = guard;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const processor = await db.dataProcessor.create({
    data: {
      ...parsed.data,
      dpaSignedAt: parsed.data.dpaSignedAt ? new Date(parsed.data.dpaSignedAt) : undefined,
    },
  });

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'privacy.processor.create',
    category: 'privacy',
    targetType: 'DataProcessor',
    targetId: processor.id,
    newValue: parsed.data,
    context: await getRequestContext(),
  });

  return NextResponse.json({ processor });
}
