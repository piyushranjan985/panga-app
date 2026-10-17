// admin/lib/payments/gatewayConfig.ts
//
// Display-only, non-secret gateway planning rows -- see
// prisma/schema.prisma's GatewayConfig comment. None of this controls
// whether live payments are actually reachable; only the env-var flags
// in admin/lib/payments/flags.ts (and lib/payments/flags.ts in the root
// app) do that.

import { db } from '@/lib/db';
import type { GatewayName } from '@prisma/client';

const DISPLAY_NAMES: Record<GatewayName, string> = {
  MOCK: 'Mock (always on)',
  RAZORPAY: 'Razorpay',
  CASHFREE: 'Cashfree',
  PAYU: 'PayU',
};

// Idempotent -- safe to call on every page load. Ensures a row exists
// for every known gateway so the Gateway Configuration screen always has
// something to show/edit, without needing a separate seed step.
export async function ensureGatewayConfigRows() {
  const names: GatewayName[] = ['MOCK', 'RAZORPAY', 'CASHFREE', 'PAYU'];
  await Promise.all(
    names.map((gateway) =>
      db.gatewayConfig.upsert({
        where: { gateway },
        create: { gateway, displayName: DISPLAY_NAMES[gateway] },
        update: {},
      }),
    ),
  );
  return db.gatewayConfig.findMany({ orderBy: { gateway: 'asc' } });
}

export async function setGatewayEnabledForLive(gateway: GatewayName, isEnabledForLive: boolean, adminId: string) {
  return db.gatewayConfig.update({
    where: { gateway },
    data: { isEnabledForLive, updatedByAdminId: adminId },
  });
}
