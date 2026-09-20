import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { assertParticipant } from '@/lib/matchAuthz';

// Private, own-eyes-only post-date check-in (see prisma/schema.prisma's
// DateFeedback model and the post-match spec). GET tells the chat page
// whether the requesting user has already submitted feedback for this
// match, so the prompt card only ever shows once; POST records it.
export async function GET(_req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const match = await assertParticipant(matchId, session.userId);
  if (!match) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const feedback = await db.dateFeedback.findUnique({
    where: { matchId_userId: { matchId, userId: session.userId } },
  });

  return NextResponse.json({ submitted: Boolean(feedback), feedback });
}

const bodySchema = z.object({
  rating: z.enum(['MEET_AGAIN', 'MAYBE', 'NOT_FOR_ME']),
  wantsToKeepChatting: z.boolean().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const match = await assertParticipant(matchId, session.userId);
  if (!match) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid feedback' }, { status: 400 });

  const feedback = await db.dateFeedback.upsert({
    where: { matchId_userId: { matchId, userId: session.userId } },
    create: { matchId, userId: session.userId, ...parsed.data },
    update: { ...parsed.data },
  });

  return NextResponse.json({ ok: true, feedback });
}
