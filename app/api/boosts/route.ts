import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { checkAccountActive } from '@/lib/accountEnforcement';
import { spendCredits } from '@/lib/payments/entitlements';
import { CREDIT_FEATURE_COSTS } from '@/lib/payments/types';
import {
  getOwnActiveBoostStatus,
  PROFILE_BOOST_DURATION_MINUTES,
  PROFILE_SPOTLIGHT_DURATION_MINUTES,
} from '@/lib/payments/visibilityBoost';

const bodySchema = z.object({ kind: z.enum(['profile_boost', 'profile_spotlight']) });

/**
 * GET /api/boosts -- the caller's own current boost status, for the
 * Discover page's "Boost active until…" chip (see
 * lib/payments/visibilityBoost.ts's getOwnActiveBoostStatus).
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const active = await getOwnActiveBoostStatus(session.userId);
  return NextResponse.json({ active });
}

/**
 * POST /api/boosts -- spends credits on `profile_boost` or
 * `profile_spotlight` (lib/payments/types.ts's CreditFeatureKey). Both
 * are the exact same mechanism underneath (see lib/payments/
 * visibilityBoost.ts's file comment): a temporary score bonus in other
 * people's Discover feed, read back from the CreditLedgerEntry this
 * spend itself writes rather than any new "boost active until" column.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const enforcement = await checkAccountActive(session.userId);
  if (enforcement.blocked) return NextResponse.json({ error: enforcement.reason }, { status: 403 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const { kind } = parsed.data;

  const cost = CREDIT_FEATURE_COSTS[kind];
  const spent = await spendCredits(session.userId, cost, `feature_redeem:${kind}`);
  if (!spent) {
    return NextResponse.json(
      {
        error: `${kind === 'profile_spotlight' ? 'Spotlight' : 'Boost'} costs ${cost} credit${cost === 1 ? '' : 's'}. Buy a credit pack to use it.`,
        code: 'INSUFFICIENT_CREDITS',
      },
      { status: 402 },
    );
  }

  const durationMinutes = kind === 'profile_spotlight' ? PROFILE_SPOTLIGHT_DURATION_MINUTES : PROFILE_BOOST_DURATION_MINUTES;
  const activeUntil = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();

  return NextResponse.json({ ok: true, kind, activeUntil });
}
