import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';
import { asPhotoEvidence } from '@/lib/moderationEvidence';
import { sendPhotoModerationPush } from '@/lib/push';

const bodySchema = z.object({
  outcome: z.enum(['RESOLVED', 'DISMISSED']),
  reason: z.string().trim().min(1).max(4000).optional(),
});

// "Resolve" and "Dismiss" both close the case; AI recommendations never
// call this automatically (spec: "AI recommendations must never
// automatically perform irreversible enforcement without the configured
// approval policy") -- a human admin always makes this call, which is why
// this route only exists behind moderation.resolve and a typed reason via
// ConfirmActionButton, never a background job.
export async function POST(req: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const guard = await requirePermission('moderation.resolve');
  if ('error' in guard) return guard.error;
  const { admin } = guard;
  const { caseId } = await params;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const existing = await db.moderationCase.findUnique({ where: { id: caseId } });
  if (!existing) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  await db.moderationCase.update({
    where: { id: caseId },
    data: {
      status: parsed.data.outcome,
      resolution: parsed.data.reason,
      resolvedAt: new Date(),
      resolvedById: admin.id,
    },
  });

  // Carry this decision through to the actual photo, and tell the user --
  // resolving/dismissing a case previously only ever updated the CASE
  // record. The photo it's about stayed stuck at MANUAL_REVIEW forever
  // (nothing else can ever move it to APPROVED), which meant it silently
  // never became visible to anyone in Discover even after a human
  // reviewed it and the case was closed, and the user was never told
  // anything happened either way.
  //
  // Only auto-decides the photo when it's still awaiting its FIRST
  // decision (MANUAL_REVIEW) -- a case opened via a user report against
  // an already-APPROVED photo is a different situation (the photo is
  // already live; enforcement there goes through the separate "remove
  // photo" User Action instead), so this deliberately leaves an
  // already-decided photo's status alone.
  const photoEvidence = asPhotoEvidence(existing.evidence);
  if (photoEvidence) {
    const photo = await db.photo.findUnique({
      where: { id: photoEvidence.photoId },
      select: { moderationStatus: true, profile: { select: { userId: true } } },
    });
    if (photo && photo.moderationStatus === 'MANUAL_REVIEW') {
      const newStatus = parsed.data.outcome === 'DISMISSED' ? 'APPROVED' : 'REJECTED';
      await db.photo.update({
        where: { id: photoEvidence.photoId },
        data: { moderationStatus: newStatus, moderatedAt: new Date() },
      });
      // Discover reads Photo.moderationStatus live on every request (see
      // lib/discoverPool.ts / app/api/discover/route.ts) -- no cache to
      // bust, no session tied to this, so the user shows up to others
      // (if approved) on the very next discover request anywhere, with
      // no logout/re-login needed on their end or anyone else's.
      await sendPhotoModerationPush(photo.profile.userId, newStatus === 'APPROVED' ? 'approved' : 'rejected').catch(
        (err) => console.error('[moderation] photo-decision push failed', err),
      );
    }
  }

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: `moderation.case.${parsed.data.outcome.toLowerCase()}`,
    category: 'moderation',
    targetType: 'ModerationCase',
    targetId: caseId,
    previousValue: { status: existing.status },
    newValue: { status: parsed.data.outcome },
    reason: parsed.data.reason,
    context: await getRequestContext(),
  });

  return NextResponse.json({ ok: true });
}
