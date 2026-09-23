import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';

const REASON_TO_CATEGORY: Record<string, string> = {
  'Inappropriate messages': 'message_violation',
  'Fake profile': 'fake_catfish',
  Harassment: 'harassment',
  'Spam or scam': 'spam',
  Other: 'other',
};

export async function POST(_req: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const guard = await requirePermission('moderation.assign');
  if ('error' in guard) return guard.error;
  const { admin } = guard;
  const { reportId } = await params;

  const report = await db.report.findUnique({ where: { id: reportId } });
  if (!report) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const existing = await db.moderationCase.findFirst({ where: { reportId } });
  if (existing) return NextResponse.json({ caseId: existing.id });

  const priorCases = await db.moderationCase.count({ where: { subjectUserId: report.aboutId, status: { in: ['RESOLVED'] } } });

  const created = await db.moderationCase.create({
    data: {
      subjectUserId: report.aboutId,
      sourceType: 'USER_REPORT',
      reportId: report.id,
      category: REASON_TO_CATEGORY[report.reason] ?? 'other',
      severity: 'MEDIUM',
      status: 'OPEN',
      isRepeatOffender: priorCases > 0,
      evidence: { reportId: report.id, reason: report.reason, details: report.details },
    },
  });

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'moderation.case.opened',
    category: 'moderation',
    targetType: 'ModerationCase',
    targetId: created.id,
    newValue: { reportId: report.id },
    context: await getRequestContext(),
  });

  return NextResponse.json({ caseId: created.id });
}
