import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { getSession } from '@/lib/session';
import { assertParticipant } from '@/lib/matchAuthz';

export async function GET(_req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const match = await assertParticipant(matchId, session.userId);
  if (!match) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const messages = await db.message.findMany({
    where: { matchId },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ messages });
}

const NO_GHOST_CLOSE =
  "Hey — I've enjoyed chatting, but I don't think we're the right match. Wishing you a good one. 💛 (sent via VybeMatch's No-Ghost close)";

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
    },
  });

  if (parsed.data.noGhostClose) {
    await db.match.update({ where: { id: matchId }, data: { unmatchedAt: new Date() } });
  }

  return NextResponse.json({ ok: true, message });
}
