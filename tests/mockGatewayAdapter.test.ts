import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MockGatewayAdapter } from '../lib/payments/mockGatewayAdapter';

describe('lib/payments/mockGatewayAdapter', () => {
  test('createOrder never calls out -- returns a mock order id synchronously-ish', async () => {
    const adapter = new MockGatewayAdapter();
    const order = await adapter.createOrder({ transactionId: 't1', amountInPaise: 1000, currency: 'INR', receipt: 't1' });
    assert.equal(order.status, 'created');
    assert.ok(order.gatewayOrderId.startsWith('mock_order_'));
  });

  test('confirmPayment defaults to success when no simulate is given', async () => {
    const adapter = new MockGatewayAdapter();
    const result = await adapter.confirmPayment({ gatewayOrderId: 'mock_order_abc' });
    assert.equal(result.status, 'succeeded');
    assert.equal(result.eventType, 'payment.succeeded');
  });

  test('confirmPayment honors simulate=failure', async () => {
    const adapter = new MockGatewayAdapter();
    const result = await adapter.confirmPayment({ gatewayOrderId: 'mock_order_abc', simulate: 'failure' });
    assert.equal(result.status, 'failed');
    assert.equal(result.eventType, 'payment.failed');
  });

  test('confirmPayment honors simulate=pending', async () => {
    const adapter = new MockGatewayAdapter();
    const result = await adapter.confirmPayment({ gatewayOrderId: 'mock_order_abc', simulate: 'pending' });
    assert.equal(result.status, 'pending');
    assert.equal(result.eventType, 'payment.pending');
  });

  test('confirmPayment on the same order+outcome produces the same externalEventId (idempotency key material)', async () => {
    const adapter = new MockGatewayAdapter();
    const r1 = await adapter.confirmPayment({ gatewayOrderId: 'mock_order_same', gatewayPaymentId: 'pay_fixed', simulate: 'success' });
    const r2 = await adapter.confirmPayment({ gatewayOrderId: 'mock_order_same', gatewayPaymentId: 'pay_fixed', simulate: 'success' });
    assert.equal(r1.externalEventId, r2.externalEventId);
  });

  test('refund never calls out -- returns a mock refund id', async () => {
    const adapter = new MockGatewayAdapter();
    const refund = await adapter.refund({ gatewayPaymentId: 'pay_1', amountInPaise: 1000 });
    assert.equal(refund.status, 'refunded');
    assert.ok(refund.gatewayRefundId.startsWith('mock_refund_'));
  });
});
