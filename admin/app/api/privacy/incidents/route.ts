import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';

const bodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5000),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  detectedAt: z.string(),
  affectedUserCount: z.number().int().nonnegative().optional(),
  affectedDataCategories: z.array(z.string()).default([]),
});

// Opening an incident is the start of the DPDP breach-handling workflow
// (DETECTED -> ASSESSING -> CONTAINED -> BOARD_NOTIFIED -> USERS_NOTIFIED
// -> CLOSED, see PrivacyIncidentStatus) -- gated by privacy.incidents.manage,
// which lib/rbac.ts's STEP_UP_REQUIRED demands a fresh step-up for.
export async function POST(req: Request) {
  const guard = await requirePermission('privacy.incidents.manage');
  if ('error' in guard) return guard.error;
  const { admin } = guard;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const incident = await db.privacyIncident.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      severity: parsed.data.severity,
      detectedAt: new Date(parsed.data.detectedAt),
      affectedUserCount: parsed.data.affectedUserCount,
      affectedDataCategories: parsed.data.affectedDataCategories,
      ownerId: admin.id,
      timeline: { create: { note: 'Incident logged.', authorId: admin.id } },
    },
  });

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'privacy.incident.create',
    category: 'privacy',
    targetType: 'PrivacyIncident',
    targetId: incident.id,
    newValue: { title: incident.title, severity: incident.severity },
    context: await getRequestContext(),
  });

  return NextResponse.json({ incident });
}
