// lib/payments/razorpayAdapter.ts
//
// Field/shape placeholder for a future real Razorpay integration --
// mirrors Razorpay's Orders API naming (orders.create / payments.capture
// / payments.refund / webhook HMAC-SHA256 verification) so swapping this
// in later is a contained change behind the same PaymentGatewayAdapter
// interface lib/payments/mockGatewayAdapter.ts implements.
//
// Every method here throws. lib/payments/gatewayFactory.ts never
// constructs this class unless Free_Tier=false AND PAYMENT_MODE=live AND
// LIVE_PAYMENTS_CONFIRMED=true -- and even then it still refuses to call
// out, because no written merchant-category confirmation from Razorpay
// exists yet for FindMyVybe's business model (dating/matchmaking is a
// restricted category subject to case-by-case approval -- see the
// findings doc's "Risks, assumptions, and open decisions" section).
// Do not remove these throws without that confirmation in hand, real API
// credentials wired through environment variables (never the database),
// an updated Terms of Service, and a dedicated security review.

import type {
  PaymentGatewayAdapter,
  CreateOrderInput,
  CreateOrderResult,
  ConfirmPaymentInput,
  ConfirmPaymentResult,
  RefundInput,
  RefundResult,
  WebhookVerificationInput,
} from './gatewayAdapter';

export class LivePaymentsNotImplementedError extends Error {
  constructor(gateway: string) {
    super(
      `${gateway} live payments are not implemented in this build. FindMyVybe's payments domain is mock-mode ` +
        `only by design -- see docs/PAYMENTS.md. A real adapter additionally requires: written merchant-category ` +
        `confirmation from ${gateway} for this business model, real API credentials in environment variables, an ` +
        `updated Terms of Service, and a dedicated security review.`,
    );
  }
}

export class RazorpayAdapter implements PaymentGatewayAdapter {
  readonly name = 'RAZORPAY' as const;

  async createOrder(_input: CreateOrderInput): Promise<CreateOrderResult> {
    throw new LivePaymentsNotImplementedError('Razorpay');
  }
  async confirmPayment(_input: ConfirmPaymentInput): Promise<ConfirmPaymentResult> {
    throw new LivePaymentsNotImplementedError('Razorpay');
  }
  async refund(_input: RefundInput): Promise<RefundResult> {
    throw new LivePaymentsNotImplementedError('Razorpay');
  }
  verifyWebhookSignature(_input: WebhookVerificationInput): boolean {
    throw new LivePaymentsNotImplementedError('Razorpay');
  }
}
