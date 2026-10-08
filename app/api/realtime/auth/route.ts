import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { assertParticipant } from '@/lib/matchAuthz';
import { createTokenRequest, realtimeConfigured } from '@/lib/realtime/ably';

// Mints the Ably TokenRequest the chat page's Ably client asks for via its
// authCallback (see app/matches/[matchId]/page.tsx). One call per
// connection/reconnect, not per message -- the resulting token is capped
// at a 1hr TTL (see lib/realtime/ably.ts's createTokenRequest) and the
// Ably client re-requests a fresh one through this same route as it
// nears expiry.
//
// matchId arrives in the POST body (not the URL) because this is a single
// shared endpoint for every match's chat screen, mirroring how the Ably
// JS SDK's authCallback works (it calls back with no route params of its
// own to work with). Authorization is still per-match and re-checked on
// every call -- assertParticipant, the same check every other
// /api/matches/[matchId]/* route uses -- so a token is only ever minted
// for a match the caller is currently a real participant of.
const bodySchema = z.object({ matchId: z.string() });

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  if (!realtimeConfigured) {
    // Chat page treats this as "stay on polling" -- see its
    // realtimeConnected fallback logic. Not an error state for the user.
    return NextResponse.json({ error: 'realtime not configured' }, { status: 503 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const match = await assertParticipant(parsed.data.matchId, session.userId);
  if (!match) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const tokenRequest = await createTokenRequest(session.userId, parsed.data.matchId);
  return NextResponse.json(tokenRequest);
}
