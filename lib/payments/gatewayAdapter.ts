// lib/payments/gatewayAdapter.ts
//
// Provider-agnostic interface every gateway integration implements --
// the rest of the payments domain (lib/payments/checkout.ts) only ever
// calls through this, never a gateway SDK directly. See
// lib/payments/mockGatewayAdapter.ts (the only one ever actually used
// while PAYMENT_MODE=mock, the default) and lib/payments/razorpayAdapter.ts
// (a shape-matching stub for the real integration, not implemented here).

export interface CreateOrderInput {
  transactionId: string;
  amountInPaise: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface CreateOrderResult {
  gatewayOrderId: string;
  status: 'created';
}

export interface ConfirmPaymentInput {
  gatewayOrderId: string;
  gatewayPaymentId?: string;
  /** Mock-adapter-only testing knob; a real adapter ignores this and reports whatever actually happened. */
  simulate?: 'success' | 'failure' | 'pending';
}

export interface ConfirmPaymentResult {
  status: 'succeeded' | 'failed' | 'pending';
  gatewayPaymentId: string;
  eventType: string;
  externalEventId: string;
  payload: Record<string, unknown>;
}

export interface RefundInput {
  gatewayPaymentId: string;
  amountInPaise: number;
}

export interface RefundResult {
  status: 'refunded';
  gatewayRefundId: string;
}

export interface WebhookVerificationInput {
  rawBody: string;
  signatureHeader: string | null;
}

export interface PaymentGatewayAdapter {
  readonly name: 'MOCK' | 'RAZORPAY' | 'CASHFREE' | 'PAYU';
  createOrder(input: CreateOrderInput): Promise<CreateOrderResult>;
  confirmPayment(input: ConfirmPaymentInput): Promise<ConfirmPaymentResult>;
  refund(input: RefundInput): Promise<RefundResult>;
  verifyWebhookSignature(input: WebhookVerificationInput): boolean;
}
