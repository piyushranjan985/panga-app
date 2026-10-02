import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { assertParticipant } from '@/lib/matchAuthz';

// Bumps Match.chatOpenAAt/chatOpenBAt (whichever side the caller is) to
// now() -- called from the chat page's existing 4s poll, not a dedicated
// timer, so "this chat is open" costs nothing beyond a request the page
// was already making. Read back via lib/notifications/push.ts's
// isChatOpenRecently() by the new-message push trigger
// (app/api/matches/[matchId]/messages/route.ts) to suppress a push when
// the recipient is already looking at the conversation -- see
// docs/PUSH_NOTIFICATIONS.md §7 (suppress-when-chat-open decision).
export async function POST(_req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const match = await assertParticipant(matchId, session.userId);
  if (!match) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const isUserA = match.userAId === session.userId;
  await db.match.update({
    where: { id: matchId },
    data: isUserA ? { chatOpenAAt: new Date() } : { chatOpenBAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
