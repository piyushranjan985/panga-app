import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';
import { sendPhotoModerationPush } from '@/lib/push';

const bodySchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  reason: z.string().trim().min(1).max(4000),
});

// A standalone override, separate from a ModerationCase's own
// Resolve/Dismiss (see .../cases/[caseId]/resolve/route.ts). That route
// only ever flips a photo once -- the moment the case closes, and only
// if the photo was still at its first decision (MANUAL_REVIEW). Once a
// case is RESOLVED or DISMISSED, ModerationCaseActions stops offering
// those buttons at all, so there was previously no way to correct a
// wrong call (a misclick on the wrong button, a photo that shouldn't
// have been auto-flagged, new information after the fact) short of
// editing the database directly -- which is how this route came to
// exist. Deliberately keyed by photoId, not caseId: it works whether or
// not there's a case open for this photo at all.
//
// Same permission as case resolution (moderation.resolve) since this is
// equally consequential -- it changes what's visible to other users in
// Discover -- and it always demands a typed reason via
// ConfirmActionButton, same as every other high-risk action here.
export async function POST(req: Request, { params }: { params: Promise<{ photoId: string }> }) {
  const guard = await requirePermission('moderation.resolve');
  if ('error' in guard) return guard.error;
  const { admin } = guard;
  const { photoId } = await params;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'A reason is required.' }, { status: 400 });

  const photo = await db.photo.findUnique({
    where: { id: photoId },
    select: { moderationStatus: true, removedAt: true, profile: { select: { userId: true } } },
  });
  if (!photo) return NextResponse.json({ error: 'Photo not found.' }, { status: 404 });
  if (photo.removedAt) {
    return NextResponse.json({ error: 'This photo was removed by an admin and cannot be re-decided.' }, { status: 409 });
  }

  const previousStatus = photo.moderationStatus;
  if (previousStatus === parsed.data.decision) {
    return NextResponse.json({ error: `Already ${parsed.data.decision.toLowerCase()}.` }, { status: 409 });
  }

  await db.photo.update({
    where: { id: photoId },
    data: { moderationStatus: parsed.data.decision, moderatedAt: new Date() },
  });

  // Same live-read contract as the case-resolve route: Discover reads
  // Photo.moderationStatus on every request, so this takes effect for
  // every other user on their very next request -- no cache to bust, no
  // action needed on the photo owner's end either.
  await sendPhotoModerationPush(photo.profile.userId, parsed.data.decision === 'APPROVED' ? 'approved' : 'rejected').catch(
    (err) => console.error('[moderation] photo-decision-override push failed', err),
  );

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'moderation.photo.decision_override',
    category: 'moderation',
    targetType: 'Photo',
    targetId: photoId,
    previousValue: { moderationStatus: previousStatus },
    newValue: { moderationStatus: parsed.data.decision },
    reason: parsed.data.reason,
    context: await getRequestContext(),
  });

  return NextResponse.json({ ok: true });
}
