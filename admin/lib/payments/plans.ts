// admin/lib/payments/plans.ts

import { db } from '@/lib/db';
import type { PaymentPlanKind, BillingInterval, IntentType } from '@prisma/client';

export interface CreatePlanVersionInput {
  slug: string;
  intent: IntentType | null;
  kind: PaymentPlanKind;
  name: string;
  description?: string;
  priceInPaise: number;
  currency?: string;
  billingInterval?: BillingInterval | null;
  creditAmount?: number | null;
  features: Record<string, boolean>;
  createdByAdminId: string;
}

// Creates a new PaymentPlan row for `slug` as the next version and
// deactivates whatever was previously the active row for that slug --
// NEVER mutates an existing row a live Subscription/Transaction already
// references. See prisma/schema.prisma's PaymentPlan comment.
export async function createPlanVersion(input: CreatePlanVersionInput) {
  return db.$transaction(async (tx) => {
    const previous = await tx.paymentPlan.findFirst({ where: { slug: input.slug }, orderBy: { version: 'desc' } });

    const created = await tx.paymentPlan.create({
      data: {
        slug: input.slug,
        intent: input.intent,
        kind: input.kind,
        name: input.name,
        description: input.description ?? '',
        priceInPaise: input.priceInPaise,
        currency: input.currency ?? 'INR',
        billingInterval: input.billingInterval ?? null,
        creditAmount: input.creditAmount ?? null,
        features: input.features,
        isActive: true,
        version: (previous?.version ?? 0) + 1,
        supersedesId: previous?.id,
        createdByAdminId: input.createdByAdminId,
      },
    });

    if (previous && previous.isActive) {
      await tx.paymentPlan.update({ where: { id: previous.id }, data: { isActive: false } });
    }

    return created;
  });
}

export async function setPlanActive(planId: string, isActive: boolean) {
  return db.paymentPlan.update({ where: { id: planId }, data: { isActive } });
}

export async function listPlanCatalog() {
  const all = await db.paymentPlan.findMany({ orderBy: [{ slug: 'asc' }, { version: 'desc' }] });
  const bySlug = new Map<string, typeof all>();
  for (const plan of all) {
    const list = bySlug.get(plan.slug) ?? [];
    list.push(plan);
    bySlug.set(plan.slug, list);
  }
  return Array.from(bySlug.entries()).map(([slug, versions]) => ({ slug, versions }));
}
