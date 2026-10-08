import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { getSession } from '@/lib/session';
import { assertParticipant, otherUserId } from '@/lib/matchAuthz';
import { checkMessagingAllowed } from '@/lib/accountEnforcement';
import { isChatOpenRecently, isPushCategoryEnabled, sendPushToUser } from '@/lib/notifications/push';
import { publishNewMessage } from '@/lib/realtime/ably';

// Most-recent messages returned, not the full history. A chat with months
// of real back-and-forth has no natural cap otherwise -- this used to
// fetch and ship every message in the match on every single page load,
// fine in testing, silently unbounded for a long-lived real conversation.
// 200 is a stopgap, not a feature: it keeps the worst case bounded without
// requiring the chat page to support "load older messages" yet (a real
// infinite-scroll/cursor-pagination UI is a reasonable follow-up, not
// needed to fix the scale risk itself -- see @@index([matchId, createdAt])
// on Message, which already supports it efficiently when that's built).
const MESSAGE_PAGE_LIMIT = 200;

export async function GET(_req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const match = await assertParticipant(matchId, session.userId);
  if (!match) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const latest = await db.message.findMany({
    where: { matchId },
    orderBy: { createdAt: 'desc' },
    take: MESSAGE_PAGE_LIMIT,
    include: {
      likes: { select: { userId: true } },
      replyTo: { select: { id: true, body: true, senderId: true, kind: true } },
    },
  });
  // Fetched newest-first (so the take: cap keeps the *recent* end of a long
  // chat, not the oldest), reversed back to the ascending order the chat
  // page already expects.
  const messages = latest.reverse();

  return NextResponse.json({ messages });
}

const NO_GHOST_CLOSE =
  "Hey — I've enjoyed chatting, but I don't think we're the right match. Wishing you a good one. 💛 (sent via findmyVybe's No-Ghost close)";

// PROMPT and PLAN are the two structured message kinds (see
// prisma/schema.prisma's MessageKind and lib/conversationStarters.ts).
// `meta` is validated loosely (any JSON object) rather than a strict
// per-kind shape: both ends of this are written together, so the payload
// shape is a contract with the chat page, not with the outside world.
const bodySchema = z.object({
  body: z.string().trim().min(1).max(1000).optional(),
  noGhostClose: z.boolean().optional(),
  kind: z.enum(['TEXT', 'PROMPT', 'PLAN']).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  // Swipe-to-reply -- an earlier message's id in this same match. Not
  // deeply validated against matchId here (the FK alone guarantees it's
  // *some* real message); a reply quoting a message from a different
  // match would only be reachable by tampering with the request directly.
  replyToId: z.string().optional(),
});

// A PROMPT/PLAN message still needs a plain-text `body` -- it's what
// shows as the preview on /api/matches' matches list, and what a client
// that doesn't know about `kind` yet would fall back to. Derived
// server-side so the caller only ever has to send the structured `meta`.
function fallbackBody(kind: 'TEXT' | 'PROMPT' | 'PLAN', meta: Record<string, unknown> | undefined): string | null {
  if (kind === 'PROMPT') {
    const question = typeof meta?.question === 'string' ? meta.question : null;
    const emoji = typeof meta?.emoji === 'string' ? meta.emoji : '⚡';
    return question ? `${emoji} ${question}` : null;
  }
  if (kind === 'PLAN') {
    const activity = meta?.activity as { label?: string; emoji?: string } | undefined;
    const vibe = typeof meta?.vibe === 'string' ? meta.vibe : null;
    if (!activity?.label) return null;
    return `✨ Plan: ${activity.emoji ? `${activity.emoji} ` : ''}${activity.label}${vibe ? ` · ${vibe} vibe` : ''}`;
  }
  return null;
}

export async function POST(req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const enforcement = await checkMessagingAllowed(session.userId);
  if (enforcement.blocked) return NextResponse.json({ error: enforcement.reason }, { status: 403 });

  const match = await assertParticipant(matchId, session.userId);
  if (!match) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid message' }, { status: 400 });

  const kind = parsed.data.kind ?? 'TEXT';
  const body = parsed.data.noGhostClose
    ? NO_GHOST_CLOSE
    : (parsed.data.body ?? fallbackBody(kind, parsed.data.meta));
  if (!body) return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 });

  const message = await db.message.create({
    data: {
      matchId,
      senderId: session.userId,
      body,
      kind,
      // z.record(...) types this as Record<string, unknown>; unknown
      // values aren't structurally assignable to Prisma's recursive Json
      // union, so it needs an explicit cast -- meta is already validated
      // loosely by design (see the comment on bodySchema above).
      meta: kind === 'TEXT' ? undefined : (parsed.data.meta as Prisma.InputJsonValue),
      replyToId: parsed.data.replyToId,
    },
    include: {
      likes: { select: { userId: true } },
      replyTo: { select: { id: true, body: true, senderId: true, kind: true } },
    },
  });

  if (parsed.data.noGhostClose) {
    await db.match.update({ where: { id: matchId }, data: { unmatchedAt: new Date() } });
  }

  // Realtime delivery -- independent of (not a replacement for) the push
  // side effect below. Never throws (see lib/realtime/ably.ts); the
  // message is already durably written at this point, so a failed/absent
  // publish just means this one message relies on the chat page's
  // fallback poll instead of arriving instantly. Fire-and-forget would
  // risk never running on a frozen serverless function, same reasoning as
  // why the push send below is awaited, so this is awaited too.
  await publishNewMessage(matchId, message);

  // New-message push -- see docs/PUSH_NOTIFICATIONS.md §4/§7. Generic
  // copy (no content preview, per §7's trigger-list decision), suppressed
  // when the recipient's own chat screen is currently open (their side's
  // chatOpenAAt/BAt was bumped recently by the heartbeat route), and
  // gated on their notifyMatchesMessages toggle. Awaited (not fire-and-
  // forget) -- a Vercel serverless function can be frozen right after it
  // returns a response, so an un-awaited send here could just never
  // happen; sendPushToUser() itself never throws on a send failure or a
  // missing Firebase setup, so this can't turn into a 500 for the
  // message itself, just a little added latency.
  const recipientId = otherUserId(match, session.userId);
  const recipientChatOpenAt = match.userAId === recipientId ? match.chatOpenAAt : match.chatOpenBAt;
  if (!isChatOpenRecently(recipientChatOpenAt)) {
    try {
      if (await isPushCategoryEnabled(recipientId, 'matchesMessages')) {
        const sender = await db.profile.findUnique({ where: { userId: session.userId }, select: { displayName: true } });
        await sendPushToUser(recipientId, 'push.message', { name: sender?.displayName ?? 'Someone' });
      }
    } catch (err) {
      console.error('[push] new-message trigger failed', err);
    }
  }

  return NextResponse.json({ ok: true, message });
}
