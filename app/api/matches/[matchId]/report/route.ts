import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { assertParticipant, otherUserId } from '@/lib/matchAuthz';

const REASONS = ['Inappropriate messages', 'Fake profile', 'Harassment', 'Spam or scam', 'Other'] as const;

const bodySchema = z.object({
  reason: z.enum(REASONS),
  details: z.string().trim().max(500).default(''),
});

// Filing a report doesn't unmatch or block on its own -- those are
// separate actions in the chat screen's ... menu, since someone might
// want to report without ending the conversation (or already has, via
// block, which unmatches on its own).
export async function POST(req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const match = await assertParticipant(matchId, session.userId);
  if (!match) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const otherId = otherUserId(match, session.userId);

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid report' }, { status: 400 });

  await db.report.create({
    data: { reporterId: session.userId, aboutId: otherId, reason: parsed.data.reason, details: parsed.data.details },
  });

  return NextResponse.json({ ok: true });
}
