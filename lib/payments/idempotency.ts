// lib/payments/idempotency.ts

import { randomUUID } from 'node:crypto';

export function generateIdempotencyKey(): string {
  return `idem_${randomUUID()}`;
}

// Deterministic id for a mock-adapter-internal transition so the
// TransactionEvent unique constraint (transactionId, eventType,
// externalEventId) still catches a duplicate even though no real gateway
// delivered a webhook with its own event id -- see prisma/schema.prisma's
// TransactionEvent comment. A real gateway's own event id is used as-is
// once PAYMENT_MODE=live.
export function mockExternalEventId(gatewayOrderId: string, eventType: string, salt = ''): string {
  return `mock-${gatewayOrderId}-${eventType}${salt ? '-' + salt : ''}`;
}
