import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/apiGuard';
import { getRequestContext } from '@/lib/requestContext';
import { writeAudit } from '@/lib/audit';
import { listPlanCatalog, createPlanVersion } from '@/lib/payments/plans';
import { ALL_FEATURE_KEYS } from '@/lib/payments/types';

export async function GET() {
  const guard = await requirePermission('payments.view');
  if ('error' in guard) return guard.error;

  const catalog = await listPlanCatalog();
  return NextResponse.json({ catalog });
}

const bodySchema = z.object({
  slug: z.string().trim().min(1).max(64),
  intent: z.enum(['JUST_VIBING', 'SOMETHING_REAL', 'RISHTA_READY']).nullable(),
  kind: z.enum(['SUBSCRIPTION', 'CREDIT_PACK']),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  priceInPaise: z.number().int().min(0),
  billingInterval: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL']).nullable().optional(),
  creditAmount: z.number().int().min(1).nullable().optional(),
  features: z.record(z.string(), z.boolean()).optional(),
});

// Always creates a NEW version row for `slug` -- see
// admin/lib/payments/plans.ts's createPlanVersion(). Never a PATCH to an
// existing plan.
export async function POST(req: Request) {
  const guard = await requirePermission('payments.manage');
  if ('error' in guard) return guard.error;
  const { admin } = guard;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const data = parsed.data;

  if (data.kind === 'SUBSCRIPTION' && !data.billingInterval) {
    return NextResponse.json({ error: 'A subscription plan needs a billing interval.' }, { status: 400 });
  }
  if (data.kind === 'CREDIT_PACK' && !data.creditAmount) {
    return NextResponse.json({ error: 'A credit pack needs a credit amount.' }, { status: 400 });
  }

  // Only ever persist known entitlement keys -- an admin can't
  // accidentally (or otherwise) grant a feature flag that isn't wired
  // into any entitlement check anywhere.
  const safeFeatures = Object.fromEntries(
    Object.entries(data.features ?? {}).filter(([key]) => (ALL_FEATURE_KEYS as string[]).includes(key)),
  );

  const plan = await createPlanVersion({
    slug: data.slug,
    intent: data.intent,
    kind: data.kind,
    name: data.name,
    description: data.description,
    priceInPaise: data.priceInPaise,
    billingInterval: data.billingInterval ?? null,
    creditAmount: data.creditAmount ?? null,
    features: safeFeatures,
    createdByAdminId: admin.id,
  });

  await writeAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: 'payments.plan.create_version',
    category: 'payments',
    targetType: 'PaymentPlan',
    targetId: plan.id,
    newValue: { slug: plan.slug, version: plan.version, priceInPaise: plan.priceInPaise, kind: plan.kind },
    context: await getRequestContext(),
  });

  return NextResponse.json({ plan });
}
