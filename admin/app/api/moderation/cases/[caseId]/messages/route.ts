import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';

// Backs the "View reported conversation" action on a moderation case
// (components/ModerationCaseMessages.tsx) -- what makes the Privacy
// Policy's "messages ... can be reviewed in response to a safety report"
// claim actually true, rather than aspirational. Gated by a narrower
// permission than the case page itself (moderation.view): message content
// is sensitive the same way moderation.viewRiskScore is, so only
// SUPER_ADMIN/ADMIN/TRUST_AND_SAFETY can pull it -- see lib/rbac.ts.
//
// Deliberately a GET the admin has to trigger (not data preloaded into the
// case page): every call here is logged via writeAudit, and a case an
// admin opens but never reviews the conversation for shouldn't generate a
// "messages viewed" audit entry it didn't earn.
export async function GET(_req: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const guard = await requirePermission('moderation.viewMessages');
  if ('error' in guard) return guard.error;
  const { admin } = guard;
  const { caseId } = await params;

  const moderationCase = await db.moderationCase.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      subjectUserId: true,
      report: { select: { reporterId: true } },
    },
  });
  if (!moderationCase) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  if (!moderationCase.report) {
    return NextResponse.json({ match: null, messages: [], reason: 'This case has no underlying report, so there is no reporter to pair against.' });
  }

  const { reporterId } = moderationCase.report;
  const subjectUserId = moderationCase.subjectUserId;

  // One match per unordered pair ever (prisma/schema.prisma's
  // @@unique([userAId, userBId]) on Match, reused by app/api/swipe/route.ts's
  // upsert even across unmatch/rematch) -- so this is the whole history,
  // not "a" conversation among several.
  const match = await db.match.findFirst({
    where: {
      OR: [
        { userAId: reporterId, userBId: subjectUserId },
        { userAId: subjectUserId, userBId: reporterId },
      ],
    },
    select: { id: true, createdAt: true, unmatchedAt: true },
  });

  if (!match) {
    return NextResponse.json({ match: null, messages: [], reason: 'No match exists between the reporter and the reported user.' });
  }

  const messages = await db.message.findMany({
    where: { matchId: match.id },
    orderBy: { createdAt: 'asc' },
    take: 500,
    select: { id: true, senderId: true, body: true, kind: true, status: true, createdAt: true, meta: true },
  });

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'moderation.case.messages_viewed',
    category: 'moderation',
    targetType: 'ModerationCase',
    targetId: moderationCase.id,
    newValue: { matchId: match.id, messageCount: messages.length },
    context: await getRequestContext(),
  });

  return NextResponse.json({
    match: { id: match.id, createdAt: match.createdAt, unmatchedAt: match.unmatchedAt, reporterId, subjectUserId },
    messages,
  });
}
