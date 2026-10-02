import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { VOUCH_NOTE_MAX_LEN, VOUCH_REACTIONS, buildVouchSummary } from '@/lib/vybeVouch';
import { isPushCategoryEnabled, sendPushToUser } from '@/lib/notifications/push';

const UNAVAILABLE = { error: "This link isn't available." } as const;

async function loadLiveInvite(token: string) {
  const invite = await db.vybeVouchInvite.findUnique({ where: { token } });
  if (!invite) return null;
  if (invite.revokedAt || invite.consumedAt) return null;
  if (invite.expiresAt.getTime() < Date.now()) return null;
  return invite;
}

// The vetter's view -- unauthenticated, token-keyed, modeled directly on
// app/api/preview/[userId]/route.ts. Missing, expired, revoked, and
// already-consumed all return the SAME generic response (never a
// different error per case) so this endpoint can't be used to probe
// invite state from outside. See docs/VYBE_VOUCH.md §3b.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await loadLiveInvite(token);
  if (!invite) return NextResponse.json(UNAVAILABLE, { status: 404 });

  const match = await db.match.findUnique({ where: { id: invite.matchId } });
  if (!match || match.unmatchedAt) return NextResponse.json(UNAVAILABLE, { status: 404 });

  const otherId = match.userAId === invite.inviterUserId ? match.userBId : match.userAId;
  const vouch = await buildVouchSummary(invite.inviterUserId, otherId);
  if (!vouch) return NextResponse.json(UNAVAILABLE, { status: 404 });

  return NextResponse.json({ vouch });
}

const bodySchema = z.object({
  reaction: z.enum(VOUCH_REACTIONS as unknown as [string, ...string[]]),
  note: z.string().trim().max(VOUCH_NOTE_MAX_LEN).default(''),
});

// Submit a reaction -- unauthenticated. On success: creates
// VybeVouchResponse, sets consumedAt, returns a simple confirmation. A
// second GET after this point hits the consumedAt check above and serves
// the same generic "unavailable" response, which the page (§4) renders
// as "you've already answered this." See docs/VYBE_VOUCH.md §3c.
//
// FLAGGED is advisory only, same as every other reaction here -- it never
// gates or blocks anything in the match itself. See docs/VYBE_VOUCH.md §1.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await loadLiveInvite(token);
  if (!invite) return NextResponse.json(UNAVAILABLE, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  await db.$transaction([
    db.vybeVouchResponse.create({
      data: { inviteId: invite.id, reaction: parsed.data.reaction, note: parsed.data.note },
    }),
    db.vybeVouchInvite.update({ where: { id: invite.id }, data: { consumedAt: new Date() } }),
  ]);

  // Push to the inviter -- generic copy, no reaction/note content in the
  // push itself (per docs/PUSH_NOTIFICATIONS.md §7's decision), own
  // settings toggle. Awaited for the same reason as every other trigger
  // here (see the messages route); never fails the reaction submission
  // itself.
  try {
    if (await isPushCategoryEnabled(invite.inviterUserId, 'vybeVouch')) {
      await sendPushToUser(invite.inviterUserId, 'push.vouch_response', { vetterLabel: invite.vetterLabel });
    }
  } catch (err) {
    console.error('[push] vouch-response trigger failed', err);
  }

  return NextResponse.json({ ok: true });
}
