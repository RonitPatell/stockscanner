/**
 * Classify SEC Form 4 transaction codes carefully.
 * Acquired/Disposed (A/D) ≠ open-market sale.
 */

import type { InsiderClassification } from "./types.ts";

/** Normalize Form 4 transactionCode (may include footnote markers). */
export function normalizeTransactionCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = String(raw).trim().toUpperCase().match(/^([A-Z])/);
  return m ? m[1]! : null;
}

/**
 * Map SEC transaction code (+ optional A/D) → product classification.
 * Does not treat every disposition as an open-market sale.
 */
export function classifyForm4Transaction(opts: {
  transactionCode: string | null | undefined;
  acquiredDisposed?: "A" | "D" | null;
}): InsiderClassification {
  const code = normalizeTransactionCode(opts.transactionCode);
  if (!code) return "other";

  switch (code) {
    case "P":
      return "open_market_purchase";
    case "S":
      return "open_market_sale";
    case "A":
      return "grant_award";
    case "M":
    case "X":
    case "C":
      return "option_exercise";
    case "G":
      return "gift";
    case "F":
      return "tax_withholding";
    case "D":
      // Disposition to the issuer — not an open-market sale
      return "other";
    case "I":
    case "L":
    case "U":
    case "W":
    case "Z":
    case "E":
    case "H":
    case "O":
    case "J":
    case "K":
    default:
      return "other";
  }
}

export function classificationLabel(c: InsiderClassification): string {
  switch (c) {
    case "open_market_purchase":
      return "Open-market purchase";
    case "open_market_sale":
      return "Open-market sale";
    case "grant_award":
      return "Grant / award";
    case "option_exercise":
      return "Option / derivative exercise";
    case "gift":
      return "Gift";
    case "tax_withholding":
      return "Tax withholding";
    default:
      return "Other transaction";
  }
}

/**
 * Signed holding change when ownership basis is compatible.
 * Requires direct ownership, finite shares, and A/D code.
 */
export function computeHoldingChange(opts: {
  shares: number | null;
  acquiredDisposed: "A" | "D" | null;
  isDirect: boolean | null;
  sharesOwnedAfter: number | null;
}): number | null {
  if (opts.isDirect !== true) return null;
  if (opts.shares == null || !Number.isFinite(opts.shares) || opts.shares < 0) {
    return null;
  }
  if (opts.acquiredDisposed !== "A" && opts.acquiredDisposed !== "D") {
    return null;
  }
  if (
    opts.sharesOwnedAfter != null &&
    Number.isFinite(opts.sharesOwnedAfter)
  ) {
    const prior =
      opts.acquiredDisposed === "A"
        ? opts.sharesOwnedAfter - opts.shares
        : opts.sharesOwnedAfter + opts.shares;
    if (prior < -0.0001) return null;
  }
  return opts.acquiredDisposed === "A" ? opts.shares : -opts.shares;
}

export function computeTransactionValue(
  shares: number | null,
  price: number | null
): number | null {
  if (shares == null || price == null) return null;
  if (!Number.isFinite(shares) || !Number.isFinite(price)) return null;
  if (shares < 0 || price < 0) return null;
  return shares * price;
}
