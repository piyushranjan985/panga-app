import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';

const bodySchema = z.object({ note: z.string().trim().min(1).max(2000) });

// Appends a plain timeline note (no status change) -- e.g. "Notified the
// hosting provider", "Legal reviewed the draft user notice". Same
// permission + step-up as every other incident mutation.
export async function POST(req: Request, { params }: { params: Promise<{ incidentId: string }> }) {
  const guard = await requirePermission('privacy.incidents.manage');
  if ('error' in guard) return guard.error;
  const { admin } = guard;
  const { incidentId } = await params;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'A note is required.' }, { status: 400 });

  const incident = await db.privacyIncident.findUnique({ where: { id: incidentId } });
  if (!incident) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const event = await db.privacyIncidentEvent.create({
    data: { incidentId, note: parsed.data.note, authorId: admin.id },
  });

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'privacy.incident.note',
    category: 'privacy',
    targetType: 'PrivacyIncident',
    targetId: incidentId,
    newValue: { note: parsed.data.note },
    context: await getRequestContext(),
  });

  return NextResponse.json({ event });
}
