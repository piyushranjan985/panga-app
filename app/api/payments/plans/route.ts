import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import { getPaymentsAccess } from '@/lib/payments/flags';

// Lists the currently active, admin-configured plans for the signed-in
// user's intent (plus universal credit packs). Always reachable (even
// under Free_Tier) so the UI can show "here's what Plus unlocks" --
// checkout itself, not this listing, is what Free_Tier actually blocks.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const access = getPaymentsAccess();

  const profile = await db.profile.findUnique({ where: { userId: session.userId }, select: { intent: true } });

  const plans = await db.paymentPlan.findMany({
    where: { isActive: true, OR: [{ intent: profile?.intent ?? undefined }, { intent: null }] },
    orderBy: [{ kind: 'asc' }, { priceInPaise: 'asc' }],
    select: {
      id: true,
      intent: true,
      kind: true,
      name: true,
      slug: true,
      description: true,
      priceInPaise: true,
      currency: true,
      billingInterval: true,
      creditAmount: true,
      features: true,
    },
  });

  return NextResponse.json({ checkoutReachable: access.checkoutReachable, plans });
}
