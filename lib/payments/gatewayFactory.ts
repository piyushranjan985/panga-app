// lib/payments/gatewayFactory.ts
//
// The ONLY place in the codebase that decides which gateway adapter to
// use. Every payments file calls getGatewayAdapter() rather than
// constructing MockGatewayAdapter/RazorpayAdapter itself, so this one
// function is the entire enforcement point for "mock unless Free_Tier is
// false AND PAYMENT_MODE=live AND LIVE_PAYMENTS_CONFIRMED=true" -- see
// lib/payments/flags.ts.

import { getPaymentsAccess } from './flags';
import type { PaymentGatewayAdapter } from './gatewayAdapter';
import { MockGatewayAdapter } from './mockGatewayAdapter';
import { RazorpayAdapter } from './razorpayAdapter';

export function getGatewayAdapter(): PaymentGatewayAdapter {
  const access = getPaymentsAccess();
  if (!access.liveGatewayActive) return new MockGatewayAdapter();
  return new RazorpayAdapter(); // currently always throws -- see razorpayAdapter.ts
}
