import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { assertParticipant, otherUserId } from '@/lib/matchAuthz';
import { resolvePairIntent, type PairIntent } from '@/lib/matchSignals';
import {
  VOUCH_EXPIRY_DAYS,
  VOUCH_LABEL_MAX_LEN,
  VOUCH_MAX_PENDING_PER_MATCH,
  isVouchEligiblePairIntent,
  vouchShareUrl,
} from '@/lib/vybeVouch';

const bodySchema = z.object({
  vetterLabel: z.string().trim().min(1).max(VOUCH_LABEL_MAX_LEN),
});

// Create a Vybe Vouch invite -- see docs/VYBE_VOUCH.md §3a. Reuses
// assertParticipant/otherUserId exactly like every other match-scoped
// route (messages/unmatch/block/report); no new auth pattern here.
export async function POST(req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const match = await assertParticipant(matchId, session.userId);
  if (!match) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const otherId = otherUserId(match, session.userId);

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  // Gated on CURRENT live intent for both participants, same as every
  // other post-match screen -- see docs/VYBE_VOUCH.md §9 for why this is
  // deliberately live and not a snapshot from when the match was made.
  const [myProfile, otherProfile] = await Promise.all([
    db.profile.findUnique({ where: { userId: session.userId }, select: { intent: true } }),
    db.profile.findUnique({ where: { userId: otherId }, select: { intent: true } }),
  ]);
  if (!myProfile || !otherProfile) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const pairIntent = resolvePairIntent(myProfile.intent as PairIntent, otherProfile.intent as PairIntent);
  if (!isVouchEligiblePairIntent(pairIntent)) {
    return NextResponse.json({ error: 'Vybe Vouch is only available for Something Real and Rishta Ready matches.' }, { status: 403 });
  }

  // Rate limit: cap pending (not yet answered, not revoked, not expired)
  // invites per inviter per match -- protects the vetter from being
  // spammed with repeat links, not the match itself (the vetted person
  // never sees any of this either way). See docs/VYBE_VOUCH.md §3a.
  const pendingCount = await db.vybeVouchInvite.count({
    where: {
      matchId,
      inviterUserId: session.userId,
      consumedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (pendingCount >= VOUCH_MAX_PENDING_PER_MATCH) {
    return NextResponse.json({ error: 'You already have the maximum number of pending Vybe Vouch invites for this match.' }, { status: 429 });
  }

  const expiresAt = new Date(Date.now() + VOUCH_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const invite = await db.vybeVouchInvite.create({
    data: {
      matchId,
      inviterUserId: session.userId,
      vetterLabel: parsed.data.vetterLabel,
      expiresAt,
    },
  });

  return NextResponse.json({
    token: invite.token,
    shareUrl: vouchShareUrl(invite.token),
    expiresAt: invite.expiresAt.toISOString(),
  });
}

// Lists the authenticated inviter's own past invites + responses for this
// match -- only ever the caller's own, never the other participant's
// (the vetted person is never shown that any of this happened).
export async function GET(_req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const match = await assertParticipant(matchId, session.userId);
  if (!match) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const invites = await db.vybeVouchInvite.findMany({
    where: { matchId, inviterUserId: session.userId },
    orderBy: { createdAt: 'desc' },
    include: { response: true },
  });

  return NextResponse.json({
    invites: invites.map((inv) => ({
      id: inv.id,
      vetterLabel: inv.vetterLabel,
      shareUrl: vouchShareUrl(inv.token),
      expiresAt: inv.expiresAt.toISOString(),
      consumedAt: inv.consumedAt?.toISOString() ?? null,
      revokedAt: inv.revokedAt?.toISOString() ?? null,
      createdAt: inv.createdAt.toISOString(),
      response: inv.response
        ? { reaction: inv.response.reaction, note: inv.response.note, createdAt: inv.response.createdAt.toISOString() }
        : null,
    })),
  });
}
