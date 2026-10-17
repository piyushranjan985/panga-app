import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { confirmCheckout, TransactionNotFoundError } from '@/lib/payments/checkout';
import { getPaymentMode } from '@/lib/payments/flags';

const bodySchema = z.object({
  // Only ever honored while PAYMENT_MODE=mock -- see below. A real
  // gateway reports its own outcome; nothing the client sends can
  // override that.
  simulate: z.enum(['success', 'failure', 'pending']).optional(),
});

// Mock-mode stand-in for "the gateway told us the payment finished" --
// in a real integration this transition comes from a server-verified
// webhook/redirect callback, never directly from the client. The
// `simulate` field only has any effect while PAYMENT_MODE=mock; it is
// silently ignored otherwise, so this endpoint can never be used to
// fabricate a live entitlement.
export async function POST(req: Request, { params }: { params: Promise<{ transactionId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const { transactionId } = await params;
  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const simulate = getPaymentMode() === 'mock' ? parsed.data.simulate : undefined;

  try {
    const result = await confirmCheckout({ transactionId, userId: session.userId, simulate });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof TransactionNotFoundError) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    throw err;
  }
}
