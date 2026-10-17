import { NextResponse } from 'next/server';
import { getGatewayAdapter } from '@/lib/payments/gatewayFactory';
import { applyGatewayEvent } from '@/lib/payments/checkout';

// Parity endpoint for a real gateway's webhook shape -- not on the mock
// flow's critical path today (app/api/payments/checkout/[transactionId]/
// confirm/route.ts calls applyGatewayEvent() directly, since there is no
// real network round-trip to a gateway to wait on in mock mode). Kept
// here, routed through the same adapter + applyGatewayEvent() idempotency
// guard, so swapping in a real gateway later needs no new webhook plumbing
// -- only a real verifyWebhookSignature() implementation.
export async function POST(req: Request) {
  const rawBody = await req.text();
  const signatureHeader = req.headers.get('x-webhook-signature');

  const adapter = getGatewayAdapter();
  if (!adapter.verifyWebhookSignature({ rawBody, signatureHeader })) {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
  }

  const body = JSON.parse(rawBody) as {
    transactionId: string;
    status: 'succeeded' | 'failed' | 'pending';
    gatewayPaymentId: string;
    eventType: string;
    externalEventId: string;
    payload?: Record<string, unknown>;
  };

  const result = await applyGatewayEvent(body.transactionId, {
    status: body.status,
    gatewayPaymentId: body.gatewayPaymentId,
    eventType: body.eventType,
    externalEventId: body.externalEventId,
    payload: body.payload ?? {},
  });

  return NextResponse.json(result);
}
