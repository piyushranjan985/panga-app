import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const matches = await db.match.findMany({
    where: {
      unmatchedAt: null,
      OR: [{ userAId: session.userId }, { userBId: session.userId }],
    },
    include: {
      userA: { include: { profile: true } },
      userB: { include: { profile: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: { createdAt: 'desc' },
  });

  const shaped = matches.map((m) => {
    const other = m.userAId === session.userId ? m.userB : m.userA;
    return {
      matchId: m.id,
      createdAt: m.createdAt,
      other: {
        userId: other.id,
        displayName: other.profile?.displayName ?? 'Panga user',
        avatarSeed: other.profile?.avatarSeed ?? 'P',
        avatarHue: other.profile?.avatarHue ?? 1,
        intent: other.profile?.intent ?? 'SOMETHING_REAL',
      },
      lastMessage: m.messages[0]
        ? { body: m.messages[0].body, senderId: m.messages[0].senderId, createdAt: m.messages[0].createdAt }
        : null,
    };
  });

  return NextResponse.json({ matches: shaped });
}
