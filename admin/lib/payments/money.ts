// admin/lib/payments/money.ts -- duplicate of the root app's lib/payments/money.ts.

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

export function formatInr(paise: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(paiseToRupees(paise));
}
