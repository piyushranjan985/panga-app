import { db } from '@/lib/db';

// Shared by every /api/matches/[matchId]/* route: a match is only usable
// by its two participants, and only while it's still active (not
// unmatched/blocked-into-ending). Centralized here instead of copy-pasted
// per route now that there are several of them (messages, vibe, partner,
// unmatch, hide, block, report).
export async function assertParticipant(matchId: string, userId: string) {
  const match = await db.match.findUnique({ where: { id: matchId } });
  if (!match || match.unmatchedAt) return null;
  if (match.userAId !== userId && match.userBId !== userId) return null;
  return match;
}

export function otherUserId(match: { userAId: string; userBId: string }, userId: string): string {
  return match.userAId === userId ? match.userBId : match.userAId;
}
