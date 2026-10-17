// admin/lib/payments/reports.ts -- GST and promo-usage summaries for the
// Reports & Compliance screen. Reads Invoice/PromoCode, never recomputes
// tax itself (that's lib/payments/gst.ts's job, at the moment an invoice
// is created) -- this is pure reporting.

import { db } from '@/lib/db';

export interface GstSummaryRow {
  invoiceNumber: string;
  createdAt: Date;
  subtotalInPaise: number;
  discountInPaise: number;
  gstInPaise: number;
  totalInPaise: number;
  placeOfSupply: string | null;
  isMock: boolean;
}

export async function getGstSummary(from?: Date, to?: Date): Promise<GstSummaryRow[]> {
  const invoices = await db.invoice.findMany({
    where: from || to ? { createdAt: { gte: from, lte: to } } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });
  return invoices.map((inv) => ({
    invoiceNumber: inv.invoiceNumber,
    createdAt: inv.createdAt,
    subtotalInPaise: inv.subtotalInPaise,
    discountInPaise: inv.discountInPaise,
    gstInPaise: inv.gstInPaise,
    totalInPaise: inv.totalInPaise,
    placeOfSupply: inv.placeOfSupply,
    isMock: inv.isMock,
  }));
}

export async function getPromoUsageSummary() {
  const promos = await db.promoCode.findMany({ orderBy: { createdAt: 'desc' } });
  return promos.map((p) => ({
    code: p.code,
    discountType: p.discountType,
    discountValue: p.discountValue,
    redemptionCount: p.redemptionCount,
    maxRedemptions: p.maxRedemptions,
    isActive: p.isActive,
    validFrom: p.validFrom,
    validUntil: p.validUntil,
  }));
}
