import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';
import { ensureGatewayConfigRows, setGatewayEnabledForLive } from '@/lib/payments/gatewayConfig';
import { db } from '@/lib/db';

export async function GET() {
  const guard = await requirePermission('payments.view');
  if ('error' in guard) return guard.error;

  const rows = await ensureGatewayConfigRows();
  return NextResponse.json({ gateways: rows });
}

const bodySchema = z.object({ gateway: z.enum(['MOCK', 'RAZORPAY', 'CASHFREE', 'PAYU']), isEnabledForLive: z.boolean() });

// Planning-only toggle -- never bypasses the env-var gate in
// lib/payments/flags.ts / admin/lib/payments/flags.ts. Setting this true
// for RAZORPAY does not enable Razorpay; it only marks it as "the one
// we'd flip on first" once a human has separately confirmed a merchant
// account and set PAYMENT_MODE=live + LIVE_PAYMENTS_CONFIRMED=true.
export async function PATCH(req: Request) {
  const guard = await requirePermission('payments.manage');
  if ('error' in guard) return guard.error;
  const { admin } = guard;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });

  const before = await db.gatewayConfig.findUnique({ where: { gateway: parsed.data.gateway } });
  const gatewayConfig = await setGatewayEnabledForLive(parsed.data.gateway, parsed.data.isEnabledForLive, admin.id);

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'payments.gateway.toggle_planning',
    category: 'payments',
    targetType: 'GatewayConfig',
    targetId: gatewayConfig.id,
    previousValue: { isEnabledForLive: before?.isEnabledForLive ?? false },
    newValue: { isEnabledForLive: gatewayConfig.isEnabledForLive },
    context: await getRequestContext(),
  });

  return NextResponse.json({ gatewayConfig });
}
