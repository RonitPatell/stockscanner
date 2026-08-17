/**
 * Map DilutionInstrument rows → financing event cards for Capital UI.
 */

import { INSTRUMENT_LABELS, type DilutionInstrumentType } from "../dilution/types.ts";
import type { CapitalFinancingEvent } from "./types.ts";

const FORM_HINT: Record<string, string> = {
  S3_SHELF: "S-3",
  S1_REGISTRATION: "S-1",
  PROSPECTUS_424B5: "424B5",
  EFFECTIVE_REGISTRATION: "EFFECT",
  ATM_PROGRAM: "ATM",
  WARRANT: "Warrant",
  WARRANT_REPRICE: "Warrant",
  CONVERTIBLE_NOTE: "Convertible",
  CONVERTIBLE_PREFERRED: "Convertible",
  REGISTERED_DIRECT: "Registered direct",
  REVERSE_SPLIT: "Reverse split",
  EQUITY_PURCHASE_AGREEMENT: "Equity purchase",
  SHARES_OUTSTANDING_CHANGE: "Share count",
};

export type FinancingInstrumentInput = {
  id: string;
  instrumentType: string;
  status: string;
  filingDate: Date | null;
  createdAt?: Date | null;
  sourceUrl: string | null;
  accessionNumber: string | null;
  potentialDilutionPct: number | null;
  estimateLabel: string;
  capacityKind: string;
  confidence: number;
  formType: string | null;
};

function capacityNote(kind: string, estimateLabel: string): string {
  switch (kind) {
    case "registration_capacity":
      return "Registration capacity — not a confirmed sale.";
    case "atm_availability":
      return "ATM availability — capacity to sell over time, not confirmed issuance.";
    case "announced_sale":
      return "Announced sale / pricing — still verify settlement.";
    case "confirmed_issuance":
      return "Filing language suggests confirmed issuance/sales.";
    default:
      return estimateLabel === "unavailable"
        ? "Terms incomplete — dilution % not calculated."
        : "See evidence; treat figures as labeled estimates only.";
  }
}

/** Prefer active / recent financing-relevant instruments for the Capital list. */
export function buildFinancingEvents(
  instruments: FinancingInstrumentInput[],
  limit = 24
): CapitalFinancingEvent[] {
  const ranked = [...instruments].sort((a, b) => {
    const aActive = a.status === "active" ? 1 : 0;
    const bActive = b.status === "active" ? 1 : 0;
    if (bActive !== aActive) return bActive - aActive;
    return (
      (b.filingDate?.getTime() ?? b.createdAt?.getTime() ?? 0) -
      (a.filingDate?.getTime() ?? a.createdAt?.getTime() ?? 0)
    );
  });

  return ranked.slice(0, limit).map((r) => ({
    id: r.id,
    instrumentType: r.instrumentType,
    label:
      INSTRUMENT_LABELS[r.instrumentType as DilutionInstrumentType] ||
      r.instrumentType,
    status: r.status,
    at: (r.filingDate ?? r.createdAt ?? new Date()).toISOString(),
    formHint: FORM_HINT[r.instrumentType] ?? r.formType,
    capacityNote: capacityNote(r.capacityKind, r.estimateLabel),
    sourceUrl: r.sourceUrl,
    accessionNumber: r.accessionNumber,
    potentialDilutionPct: r.potentialDilutionPct,
    estimateLabel: r.estimateLabel,
    confidence: r.confidence,
  }));
}
