// lib/payments/discount.ts -- pure promo-discount math, shared by the
// checkout flow and its tests.

export interface PromoLike {
  discountType: 'PERCENT' | 'FLAT';
  discountValue: number;
}

export function applyDiscount(amountInPaise: number, promo: PromoLike | null): number {
  if (!promo) return 0;
  if (promo.discountType === 'PERCENT') {
    const pct = Math.max(0, Math.min(100, promo.discountValue));
    return Math.round((amountInPaise * pct) / 100);
  }
  return Math.max(0, Math.min(amountInPaise, promo.discountValue));
}
