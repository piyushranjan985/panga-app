// lib/payments/money.ts -- all prices in this domain are stored/passed
// as integer paise (rupees x100) to avoid floating-point rounding on
// money; these are the only conversion points.

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

export function formatInr(paise: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(paiseToRupees(paise));
}
