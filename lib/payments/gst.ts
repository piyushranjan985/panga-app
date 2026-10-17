// lib/payments/gst.ts
//
// Directional GST math for a domestic Indian digital-services sale, not
// a substitute for a CA's sign-off before any real (non-mock) invoice is
// issued -- see the findings doc's compliance checklist and
// docs/PAYMENTS.md. Same-state sales split into CGST+SGST; everything
// else (including an unknown place of supply) is treated as IGST, which
// is the conservative default for a remotely-delivered digital service.

export const DEFAULT_GST_RATE_PERCENT = 18;

export interface GstBreakdown {
  cgstInPaise: number;
  sgstInPaise: number;
  igstInPaise: number;
  totalGstInPaise: number;
}

export interface GstCalculationInput {
  taxableAmountInPaise: number;
  /** The state FindMyVybe is GST-registered in, e.g. "DL", "MH". */
  supplierStateCode: string;
  /** The customer's billing state, when known. Unknown -> IGST. */
  placeOfSupplyStateCode?: string | null;
  gstRatePercent?: number;
}

export function calculateGst(input: GstCalculationInput): GstBreakdown {
  const rate = input.gstRatePercent ?? DEFAULT_GST_RATE_PERCENT;
  const totalGstInPaise = Math.round((input.taxableAmountInPaise * rate) / 100);
  const sameState =
    !!input.placeOfSupplyStateCode &&
    input.placeOfSupplyStateCode.trim().toUpperCase() === input.supplierStateCode.trim().toUpperCase();

  if (sameState) {
    const half = Math.round(totalGstInPaise / 2);
    return { cgstInPaise: half, sgstInPaise: totalGstInPaise - half, igstInPaise: 0, totalGstInPaise };
  }
  return { cgstInPaise: 0, sgstInPaise: 0, igstInPaise: totalGstInPaise, totalGstInPaise };
}

export function priceWithGst(
  taxableAmountInPaise: number,
  opts: Omit<GstCalculationInput, 'taxableAmountInPaise'>,
): GstBreakdown & { subtotalInPaise: number; totalInPaise: number } {
  const gst = calculateGst({ taxableAmountInPaise, ...opts });
  return { subtotalInPaise: taxableAmountInPaise, ...gst, totalInPaise: taxableAmountInPaise + gst.totalGstInPaise };
}
