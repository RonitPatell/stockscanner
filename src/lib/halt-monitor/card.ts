import type { HaltRecord } from "./types.ts";
import { formatResumptionTime } from "./reconcile.ts";
import { getHaltCodeInfo } from "./codes.ts";
import { sessionHaltCount } from "./store.ts";

/** Compact Decision Card V3 halt strip model — no trade suggestions. */
export interface HaltCardModel {
  symbol: string;
  active: boolean;
  haltCode: string;
  haltCodeTitle: string;
  lifecycle: string;
  haltReason: string | null;
  haltStartAt: string | null;
  newsDisseminationStatus: string;
  resumptionQuoteLabel: string;
  resumptionTradeLabel: string;
  sessionHaltCount: number | null;
  sessionHaltCountNote: string | null;
  confidence: string;
  reconciliationStatus: string;
  catalystCount: number;
  filingCount: number;
  source: string;
  disclaimer: string;
}

export async function buildHaltCardModel(
  symbol: string,
  record: HaltRecord | null,
  opts?: { sessionCount?: number | null }
): Promise<HaltCardModel> {
  const info = record ? getHaltCodeInfo(record.haltCode) : null;
  const count =
    opts?.sessionCount ??
    (record
      ? await sessionHaltCount(record.symbol, record.sessionDateEt)
      : null);

  if (!record) {
    return {
      symbol: symbol.toUpperCase(),
      active: false,
      haltCode: "—",
      haltCodeTitle: "No active official halt",
      lifecycle: "trading",
      haltReason: null,
      haltStartAt: null,
      newsDisseminationStatus: "unknown",
      resumptionQuoteLabel: "not yet announced",
      resumptionTradeLabel: "not yet announced",
      sessionHaltCount: count,
      sessionHaltCountNote:
        count == null ? "no_exchange_halt_feed" : null,
      confidence: "unavailable",
      reconciliationStatus: "single_source",
      catalystCount: 0,
      filingCount: 0,
      source: "none",
      disclaimer:
        "Informational halt status only — not a trade recommendation. Resumption times appear only when the exchange announces them.",
    };
  }

  const active =
    record.lifecycle === "halted" ||
    record.lifecycle === "news_disseminated" ||
    record.lifecycle === "resumption_quote_scheduled";

  return {
    symbol: record.symbol,
    active,
    haltCode: record.haltCode,
    haltCodeTitle: info?.title ?? record.haltCode,
    lifecycle: record.lifecycle,
    haltReason: record.haltReason,
    haltStartAt: record.haltStartAt,
    newsDisseminationStatus: record.newsDisseminationStatus,
    resumptionQuoteLabel: formatResumptionTime(record.officialResumptionQuoteAt),
    resumptionTradeLabel: formatResumptionTime(record.officialResumptionTradeAt),
    sessionHaltCount: count,
    sessionHaltCountNote: null,
    confidence: record.confidence,
    reconciliationStatus: record.reconciliationStatus,
    catalystCount: record.catalystIds.length,
    filingCount: record.filingOrNewsIds.length,
    source: record.source,
    disclaimer:
      "Informational halt status only — not a trade recommendation. Resumption times appear only when the exchange announces them.",
  };
}
