/**
 * Contextual Form 4 summaries — factual, no predictive alpha.
 */

import { classificationLabel } from "./classify.ts";
import type { InsiderClassification, ParsedInsiderTransaction } from "./types.ts";

function fmtShares(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtPrice(n: number): string {
  if (n >= 100) return `$${n.toFixed(2)}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

function rolePhrase(tx: ParsedInsiderTransaction): string {
  if (tx.officerTitle?.trim()) return tx.officerTitle.trim();
  const bits: string[] = [];
  if (tx.isOfficer) bits.push("Officer");
  if (tx.isDirector) bits.push("Director");
  if (tx.isTenPercent) bits.push("10% owner");
  return bits.length ? bits.join(" / ") : "Reporting person";
}

/**
 * Build a plain-language summary for one structured transaction.
 * Example: "CEO sold 25,000 shares at a reported transaction price of $12.50."
 */
export function buildInsiderSummary(tx: ParsedInsiderTransaction): string {
  const who = tx.ownerName?.trim() || "Reporting person";
  const role = rolePhrase(tx);
  const whoRole =
    role !== "Reporting person" && !who.toLowerCase().includes(role.toLowerCase())
      ? `${who} (${role})`
      : who;

  const shares =
    tx.shares != null && Number.isFinite(tx.shares)
      ? fmtShares(tx.shares)
      : null;
  const price =
    tx.pricePerShare != null && Number.isFinite(tx.pricePerShare)
      ? fmtPrice(tx.pricePerShare)
      : null;

  const plan =
    tx.is10b51 === true ? " (Rule 10b5-1 plan indicated in the filing)" : "";

  switch (tx.classification as InsiderClassification) {
    case "open_market_sale":
      if (shares && price) {
        return `${whoRole} sold ${shares} shares at a reported transaction price of ${price}.${plan}`;
      }
      if (shares) {
        return `${whoRole} sold ${shares} shares (open-market sale; price not reported).${plan}`;
      }
      return `${whoRole} reported an open-market sale.${plan}`;

    case "open_market_purchase":
      if (shares && price) {
        return `${whoRole} purchased ${shares} shares at a reported transaction price of ${price}.${plan}`;
      }
      if (shares) {
        return `${whoRole} purchased ${shares} shares (open-market; price not reported).${plan}`;
      }
      return `${whoRole} reported an open-market purchase.${plan}`;

    case "grant_award":
      return shares
        ? `${whoRole} was granted/awarded ${shares} shares (${classificationLabel("grant_award")}).`
        : `${whoRole} reported a grant/award.`;

    case "option_exercise":
      return shares
        ? `${whoRole} reported an option/derivative exercise involving ${shares} shares.`
        : `${whoRole} reported an option/derivative exercise.`;

    case "gift":
      return shares
        ? `${whoRole} reported a gift of ${shares} shares.`
        : `${whoRole} reported a gift.`;

    case "tax_withholding":
      return shares
        ? `${whoRole} reported tax withholding of ${shares} shares (not an open-market sale).`
        : `${whoRole} reported a tax-withholding transaction (not an open-market sale).`;

    default: {
      const label = classificationLabel(tx.classification);
      const ad =
        tx.acquiredDisposed === "A"
          ? "acquisition"
          : tx.acquiredDisposed === "D"
            ? "disposition"
            : "transaction";
      if (shares && price) {
        return `${whoRole} reported a ${ad} of ${shares} shares at ${price} (${label}; code ${tx.transactionCode ?? "n/a"}).${plan}`;
      }
      if (shares) {
        return `${whoRole} reported a ${ad} of ${shares} shares (${label}; code ${tx.transactionCode ?? "n/a"}).${plan}`;
      }
      return `${whoRole} reported a Form 4 ${ad} (${label}).${plan}`;
    }
  }
}
