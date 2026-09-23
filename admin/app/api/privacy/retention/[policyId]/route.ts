import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';

const bodySchema = z.object({ autoDeleteEnabled: z.boolean() });

// autoDeleteEnabled is a flag other tooling (a future scheduled job) would
// read to decide whether to actually purge past-retention rows -- this
// portal only manages the policy row itself; no purge job exists yet
// (nothing in the spec asked for one, and inventing an automatic bulk-
// delete job against production data is exactly the kind of "don't invent
// functionality" risk called out in the brief).
export async function PATCH(req: Request, { params }: { params: Promise<{ policyId: string }> }) {
  const guard = await requirePermission('privacy.retention.manage');
  if ('error' in guard) return guard.error;
  const { admin } = guard;
  const { policyId } = await params;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const existing = await db.retentionPolicy.findUnique({ where: { id: policyId } });
  if (!existing) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  await db.retentionPolicy.update({ where: { id: policyId }, data: { autoDeleteEnabled: parsed.data.autoDeleteEnabled, lastReviewedAt: new Date() } });

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'privacy.retention.toggleAutoDelete',
    category: 'privacy',
    targetType: 'RetentionPolicy',
    targetId: policyId,
    previousValue: { autoDeleteEnabled: existing.autoDeleteEnabled },
    newValue: { autoDeleteEnabled: parsed.data.autoDeleteEnabled },
    context: await getRequestContext(),
  });

  return NextResponse.json({ ok: true });
}
