/**
 * Shared SEC company_tickers.json loader.
 * Used by SymbolMaster refresh, EDGAR Atom CIK→ticker mapping, and identity resolve.
 */

import { SEC_USER_AGENT, waitForSecPermit } from "../ingest/sec-politeness.ts";
import { isValidTickerFormat } from "../ticker-utils.ts";
import { normalizeCik, normalizeSymbol } from "./normalize.ts";
import type { SecTickerEntry, SecTickerMapResult } from "./types.ts";

export const SEC_COMPANY_TICKERS_URL =
  "https://www.sec.gov/files/company_tickers.json";

const CACHE_MS = 24 * 60 * 60 * 1000;

let cached: SecTickerMapResult | null = null;

export function parseSecCompanyTickersJson(
  data: unknown
): { byTicker: Map<string, SecTickerEntry>; byCik: Map<string, SecTickerEntry> } | null {
  if (!data || typeof data !== "object") return null;
  const byTicker = new Map<string, SecTickerEntry>();
  const byCik = new Map<string, SecTickerEntry>();

  for (const entry of Object.values(data as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as { cik_str?: unknown; ticker?: unknown; title?: unknown };
    const ticker = normalizeSymbol(String(rec.ticker ?? ""));
    const cik = normalizeCik(rec.cik_str as string | number | null);
    if (!ticker || !isValidTickerFormat(ticker) || !cik) continue;
    const title =
      typeof rec.title === "string" && rec.title.trim() ? rec.title.trim() : null;
    const row: SecTickerEntry = { ticker, cik, title };
    if (!byTicker.has(ticker)) byTicker.set(ticker, row);
    byCik.set(cik, row);
    byCik.set(cik.replace(/^0+/, "") || "0", row);
  }

  return { byTicker, byCik };
}

export async function loadSecCompanyTickerMap(opts?: {
  force?: boolean;
}): Promise<SecTickerMapResult> {
  if (!opts?.force && cached && Date.now() - cached.fetchedAt < CACHE_MS && cached.ok) {
    return cached;
  }

  const permitted = await waitForSecPermit(2_500);
  if (!permitted) {
    return {
      ok: false,
      byTicker: cached?.byTicker ?? new Map(),
      byCik: cached?.byCik ?? new Map(),
      fetchedAt: Date.now(),
      errorCode: "rate_limited",
    };
  }

  try {
    const res = await fetch(SEC_COMPANY_TICKERS_URL, {
      headers: { "User-Agent": SEC_USER_AGENT },
      cache: "no-store",
    });
    if (!res.ok) {
      return {
        ok: false,
        byTicker: cached?.byTicker ?? new Map(),
        byCik: cached?.byCik ?? new Map(),
        fetchedAt: Date.now(),
        errorCode: "http_error",
      };
    }
    const json: unknown = await res.json();
    const parsed = parseSecCompanyTickersJson(json);
    if (!parsed) {
      return {
        ok: false,
        byTicker: cached?.byTicker ?? new Map(),
        byCik: cached?.byCik ?? new Map(),
        fetchedAt: Date.now(),
        errorCode: "invalid_payload",
      };
    }
    cached = {
      ok: true,
      byTicker: parsed.byTicker,
      byCik: parsed.byCik,
      fetchedAt: Date.now(),
      errorCode: "ok",
    };
    return cached;
  } catch {
    return {
      ok: false,
      byTicker: cached?.byTicker ?? new Map(),
      byCik: cached?.byCik ?? new Map(),
      fetchedAt: Date.now(),
      errorCode: "network",
    };
  }
}

export function __setSecTickerMapForTests(map: SecTickerMapResult | null): void {
  cached = map;
}

export function __resetSecTickerCacheForTests(): void {
  cached = null;
}
