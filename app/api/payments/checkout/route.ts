import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import {
  createCheckout,
  FreeTierCheckoutBlockedError,
  PlanNotFoundError,
  InvalidPromoCodeError,
} from '@/lib/payments/checkout';

const bodySchema = z.object({
  planId: z.string().min(1),
  promoCode: z.string().trim().min(1).max(64).optional(),
  placeOfSupplyStateCode: z.string().trim().length(2).optional(),
  // Lets a client safely retry a checkout call (flaky network, etc.)
  // without risking a second Transaction row for the same attempt.
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});

// Creates a mock (or, once truly live, real) checkout order. Never trusts
// a client-supplied price -- createCheckout() always re-reads the plan
// and recomputes amount/discount/GST/total server-side. Blocked entirely
// while Free_Tier is on, independent of PAYMENT_MODE.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  try {
    const checkout = await createCheckout({ userId: session.userId, ...parsed.data });
    return NextResponse.json(checkout);
  } catch (err) {
    if (err instanceof FreeTierCheckoutBlockedError) {
      return NextResponse.json({ error: 'Paid plans are not available right now.' }, { status: 403 });
    }
    if (err instanceof PlanNotFoundError) return NextResponse.json({ error: 'Plan not found.' }, { status: 404 });
    if (err instanceof InvalidPromoCodeError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
