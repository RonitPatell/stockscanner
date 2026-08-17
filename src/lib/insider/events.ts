/**
 * Map structured insider transactions → CompanyEvents for Watchtower.
 * Never implies predictive alpha.
 */

import type { ClassifiedCompanyEvent } from "../company-events/classify.ts";
import type { CompanyEventSeverity, CompanyEventType } from "../company-events/types.ts";
import { filingEventFingerprint } from "../company-events/types.ts";
import { classificationLabel } from "./classify.ts";
import type { InsiderClassification, ParsedInsiderTransaction } from "./types.ts";

function eventTypeFor(c: InsiderClassification): CompanyEventType {
  switch (c) {
    case "open_market_purchase":
      return "insider_purchase";
    case "open_market_sale":
      return "insider_sale";
    case "grant_award":
      return "insider_grant";
    case "tax_withholding":
    case "gift":
    case "option_exercise":
    case "other":
    default:
      return "insider_disposition_other";
  }
}

function severityFor(c: InsiderClassification): CompanyEventSeverity {
  switch (c) {
    case "open_market_sale":
    case "open_market_purchase":
      return "notable";
    case "grant_award":
    case "tax_withholding":
      return "info";
    default:
      return "info";
  }
}

export function mapInsiderTransactionsToEvents(opts: {
  symbol: string;
  cik?: string | null;
  accessionNumber: string;
  sourceUrl?: string | null;
  filedAt: Date;
  catalystId?: string | null;
  transactions: ParsedInsiderTransaction[];
  transactionIds?: string[];
}): ClassifiedCompanyEvent[] {
  const sym = opts.symbol.trim().toUpperCase();
  const out: ClassifiedCompanyEvent[] = [];

  for (let i = 0; i < opts.transactions.length; i++) {
    const tx = opts.transactions[i]!;
    const eventType = eventTypeFor(tx.classification);
    const discriminant = `tx:${i}:${tx.transactionCode ?? "x"}:${tx.shares ?? 0}`;
    const occurredAt = tx.transactionDate
      ? new Date(tx.transactionDate)
      : opts.filedAt;
    const safeOccurred = Number.isFinite(occurredAt.getTime())
      ? occurredAt
      : opts.filedAt;

    out.push({
      symbol: sym,
      cik: opts.cik ?? tx.issuerCik ?? null,
      category: "insider",
      eventType,
      severity: severityFor(tx.classification),
      title: `${classificationLabel(tx.classification)} — ${tx.ownerName}`,
      summary: `${tx.summaryText} Informational Form 4 context — not a trading signal.`,
      occurredAt: safeOccurred,
      sourceType: "sec",
      sourceId: opts.accessionNumber,
      sourceUrl: opts.sourceUrl ?? null,
      evidenceJson: {
        classification: tx.classification,
        transactionCode: tx.transactionCode,
        acquiredDisposed: tx.acquiredDisposed,
        shares: tx.shares,
        pricePerShare: tx.pricePerShare,
        transactionValue: tx.transactionValue,
        sharesOwnedAfter: tx.sharesOwnedAfter,
        holdingChange: tx.holdingChange,
        isDirect: tx.isDirect,
        is10b51: tx.is10b51,
        ownerName: tx.ownerName,
        officerTitle: tx.officerTitle,
        insiderTransactionId: opts.transactionIds?.[i] ?? null,
        engine: "insider",
      },
      fingerprint: filingEventFingerprint({
        symbol: sym,
        eventType,
        accession: opts.accessionNumber,
        discriminant,
      }),
      catalystId: opts.catalystId ?? null,
      dilutionInstrumentId: null,
      confidence: 0.85,
    });
  }

  return out;
}
