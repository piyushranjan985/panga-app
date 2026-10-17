import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getEntitlements } from '@/lib/payments/entitlements';

// What the consumer app actually reads to decide what to show/enable --
// always computed fresh server-side, never cached client-side as a
// durable flag. See lib/payments/entitlements.ts.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const entitlements = await getEntitlements(session.userId);
  return NextResponse.json(entitlements);
}
