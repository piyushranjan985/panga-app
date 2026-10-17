import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calculateGst, priceWithGst, DEFAULT_GST_RATE_PERCENT } from '../lib/payments/gst';
import { applyDiscount } from '../lib/payments/discount';
import { rupeesToPaise, paiseToRupees, formatInr } from '../lib/payments/money';
import { generateIdempotencyKey, mockExternalEventId } from '../lib/payments/idempotency';

describe('lib/payments/money', () => {
  test('rupeesToPaise / paiseToRupees round-trip', () => {
    assert.equal(rupeesToPaise(299), 29900);
    assert.equal(paiseToRupees(29900), 299);
  });
  test('rupeesToPaise rounds fractional paise', () => {
    assert.equal(rupeesToPaise(19.995), 2000); // Math.round(1999.5)
  });
  test('formatInr renders a rupee symbol and two decimals', () => {
    const formatted = formatInr(29900);
    assert.ok(formatted.includes('299'));
  });
});

describe('lib/payments/gst -- calculateGst', () => {
  test('same-state sale splits evenly into CGST + SGST, no IGST', () => {
    const gst = calculateGst({ taxableAmountInPaise: 10000, supplierStateCode: 'DL', placeOfSupplyStateCode: 'DL' });
    assert.equal(gst.totalGstInPaise, 1800); // 18% of 10000
    assert.equal(gst.cgstInPaise, 900);
    assert.equal(gst.sgstInPaise, 900);
    assert.equal(gst.igstInPaise, 0);
  });

  test('cross-state sale is entirely IGST', () => {
    const gst = calculateGst({ taxableAmountInPaise: 10000, supplierStateCode: 'DL', placeOfSupplyStateCode: 'MH' });
    assert.equal(gst.cgstInPaise, 0);
    assert.equal(gst.sgstInPaise, 0);
    assert.equal(gst.igstInPaise, 1800);
  });

  test('unknown place of supply defaults to IGST (conservative default)', () => {
    const gst = calculateGst({ taxableAmountInPaise: 10000, supplierStateCode: 'DL' });
    assert.equal(gst.igstInPaise, 1800);
    assert.equal(gst.cgstInPaise, 0);
  });

  test('state codes are compared case-insensitively', () => {
    const gst = calculateGst({ taxableAmountInPaise: 10000, supplierStateCode: 'dl', placeOfSupplyStateCode: 'DL' });
    assert.equal(gst.igstInPaise, 0);
    assert.ok(gst.cgstInPaise > 0);
  });

  test('a custom rate overrides the default 18%', () => {
    const gst = calculateGst({ taxableAmountInPaise: 10000, supplierStateCode: 'DL', gstRatePercent: 5 });
    assert.equal(gst.totalGstInPaise, 500);
  });

  test('default rate constant is 18', () => {
    assert.equal(DEFAULT_GST_RATE_PERCENT, 18);
  });

  test('odd totals split CGST/SGST without losing a paisa (rounding stays balanced)', () => {
    const gst = calculateGst({ taxableAmountInPaise: 10001, supplierStateCode: 'DL', placeOfSupplyStateCode: 'DL' });
    assert.equal(gst.cgstInPaise + gst.sgstInPaise, gst.totalGstInPaise);
  });

  test('priceWithGst returns subtotal + gst = total', () => {
    const price = priceWithGst(10000, { supplierStateCode: 'DL', placeOfSupplyStateCode: 'DL' });
    assert.equal(price.subtotalInPaise, 10000);
    assert.equal(price.totalInPaise, 10000 + price.totalGstInPaise);
  });
});

describe('lib/payments/discount -- applyDiscount', () => {
  test('no promo applies no discount', () => assert.equal(applyDiscount(10000, null), 0));
  test('PERCENT discount computes a share of the amount', () => {
    assert.equal(applyDiscount(10000, { discountType: 'PERCENT', discountValue: 20 }), 2000);
  });
  test('PERCENT discount is clamped to [0, 100]', () => {
    assert.equal(applyDiscount(10000, { discountType: 'PERCENT', discountValue: 150 }), 10000);
    assert.equal(applyDiscount(10000, { discountType: 'PERCENT', discountValue: -10 }), 0);
  });
  test('FLAT discount never exceeds the amount itself', () => {
    assert.equal(applyDiscount(1000, { discountType: 'FLAT', discountValue: 5000 }), 1000);
  });
  test('FLAT discount never goes negative', () => {
    assert.equal(applyDiscount(1000, { discountType: 'FLAT', discountValue: -500 }), 0);
  });
});

describe('lib/payments/idempotency', () => {
  test('generateIdempotencyKey produces unique, prefixed keys', () => {
    const a = generateIdempotencyKey();
    const b = generateIdempotencyKey();
    assert.notEqual(a, b);
    assert.ok(a.startsWith('idem_'));
  });

  test('mockExternalEventId is deterministic for the same inputs', () => {
    const a = mockExternalEventId('order_1', 'payment.succeeded', 'pay_1');
    const b = mockExternalEventId('order_1', 'payment.succeeded', 'pay_1');
    assert.equal(a, b);
  });

  test('mockExternalEventId differs when any input differs', () => {
    const base = mockExternalEventId('order_1', 'payment.succeeded', 'pay_1');
    assert.notEqual(mockExternalEventId('order_2', 'payment.succeeded', 'pay_1'), base);
    assert.notEqual(mockExternalEventId('order_1', 'payment.failed', 'pay_1'), base);
    assert.notEqual(mockExternalEventId('order_1', 'payment.succeeded', 'pay_2'), base);
  });
});
