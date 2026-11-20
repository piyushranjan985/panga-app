// lib/payments/mockGatewayAdapter.ts
//
// Simulates every gateway outcome locally -- no network call, ever. This
// is the only adapter lib/payments/gatewayFactory.ts ever constructs
// while PAYMENT_MODE=mock (the default, and the only mode this build
// implements end-to-end).

import { randomUUID } from "node:crypto";
import type {
  PaymentGatewayAdapter,
  CreateOrderInput,
  CreateOrderResult,
  ConfirmPaymentInput,
  ConfirmPaymentResult,
  RefundInput,
  RefundResult,
  WebhookVerificationInput,
} from "./gatewayAdapter";
import { mockExternalEventId } from "./idempotency";

export class MockGatewayAdapter implements PaymentGatewayAdapter {
  readonly name = "MOCK" as const;

  async createOrder(_input: CreateOrderInput): Promise<CreateOrderResult> {
    return { gatewayOrderId: `mock_order_${randomUUID()}`, status: "created" };
  }

  async confirmPayment(
    input: ConfirmPaymentInput,
  ): Promise<ConfirmPaymentResult> {
    const outcome = input.simulate ?? "success";
    const gatewayPaymentId =
      input.gatewayPaymentId ?? `mock_pay_${randomUUID()}`;
    const status =
      outcome === "success"
        ? "succeeded"
        : outcome === "pending"
          ? "pending"
          : "failed";
    const eventType =
      status === "succeeded"
        ? "payment.succeeded"
        : status === "pending"
          ? "payment.pending"
          : "payment.failed";
    return {
      status,
      gatewayPaymentId,
      eventType,
      externalEventId: mockExternalEventId(
        input.gatewayOrderId,
        eventType,
        gatewayPaymentId,
      ),
      payload: {
        mock: true,
        gatewayOrderId: input.gatewayOrderId,
        simulated: outcome,
      },
    };
  }

  async refund(_input: RefundInput): Promise<RefundResult> {
    return {
      status: "refunded",
      gatewayRefundId: `mock_refund_${randomUUID()}`,
    };
  }

  verifyWebhookSignature(_input: WebhookVerificationInput): boolean {
    // Fail CLOSED, not open. Nothing legitimate calls this in mock mode
    // (confirmPayment() is invoked directly, by an ownership-checked
    // session route -- see app/api/payments/checkout/[transactionId]/
    // confirm/route.ts -- there is no real inbound webhook to verify).
    // Returning true unconditionally here used to mean POST /api/payments/
    // webhook would accept ANY caller-asserted transactionId/status
    // (including "succeeded") with no signature and no ownership check,
    // since applyGatewayEvent() itself trusts its caller to have already
    // authorized the event. There is nothing to verify a signature
    // against in mock mode, so the safe default is to reject -- same
    // "ships before configured, never crashes, fails closed" rule every
    // other unconfigured integration in this app follows.
    return false;
  }
}
