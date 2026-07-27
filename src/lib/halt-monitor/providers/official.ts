import type { HaltProvider, HaltProviderEvent } from "../types.ts";
import { normalizeHaltCode } from "../codes.ts";

/**
 * Official exchange halt provider.
 * Configure HALT_OFFICIAL_URL to a JSON feed of halt rows.
 * Shape: { items: [{ symbol, exchange?, code, reason?, eventAt, lifecycle?,
 *   newsStatus?, resumptionQuoteAt?, resumptionTradeAt?, ... }] }
 * Never invents resumption times — only passes through official fields.
 */
export function createOfficialExchangeProvider(opts?: {
  fetchImpl?: typeof fetch;
  url?: string | null;
}): HaltProvider {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  return {
    id: "official_exchange",
    kind: "official_exchange",
    lastSuccessAt: null,
    async fetchHalts(symbols?: string[]): Promise<HaltProviderEvent[]> {
      const url =
        opts?.url ??
        process.env.HALT_OFFICIAL_URL ??
        process.env.NASDAQ_HALT_STATUS_URL ??
        null;
      if (!url) return [];

      try {
        const res = await fetchImpl(url, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(12_000),
        });
        if (!res.ok) return [];
        const json = (await res.json()) as {
          items?: Record<string, unknown>[];
          data?: Record<string, unknown>[];
        };
        const rows = json.items ?? json.data ?? [];
        const want = symbols?.map((s) => s.toUpperCase());
        const out: HaltProviderEvent[] = [];
        for (const row of rows) {
          const symbol = String(row.symbol ?? row.ticker ?? "")
            .toUpperCase()
            .trim();
          if (!symbol) continue;
          if (want && !want.includes(symbol)) continue;
          const eventAt = String(
            row.eventAt ?? row.haltTime ?? row.updatedAt ?? row.timestamp ?? ""
          );
          if (!eventAt || !Number.isFinite(Date.parse(eventAt))) continue;

          const quoteAt = pickOfficialTime(
            row.resumptionQuoteAt ?? row.quoteResumptionAt ?? row.quoteTime
          );
          const tradeAt = pickOfficialTime(
            row.resumptionTradeAt ?? row.tradeResumptionAt ?? row.tradeTime
          );

          out.push({
            symbol,
            exchange: row.exchange ? String(row.exchange) : null,
            haltCode: normalizeHaltCode(String(row.code ?? row.haltCode ?? "UNKNOWN")),
            haltReason: row.reason ? String(row.reason) : null,
            eventAt: new Date(eventAt).toISOString(),
            lifecycle: (row.lifecycle as HaltProviderEvent["lifecycle"]) ?? null,
            newsDisseminationStatus:
              (row.newsStatus as HaltProviderEvent["newsDisseminationStatus"]) ??
              null,
            officialResumptionQuoteAt: quoteAt,
            officialResumptionTradeAt: tradeAt,
            lastPriceBeforeHalt: num(row.lastPriceBeforeHalt ?? row.lastPrice),
            lastSpreadBeforeHalt: num(row.lastSpreadBeforeHalt ?? row.spread),
            volumeBeforeHalt: num(row.volumeBeforeHalt ?? row.volume),
            source: "official_exchange",
            sourceKind: "official_exchange",
            sourceTimestamp: new Date(eventAt).toISOString(),
            rawPayload: row,
          });
        }
        return out;
      } catch {
        return [];
      }
    },
  };
}

function pickOfficialTime(v: unknown): string | null {
  if (v == null || v === "") return null;
  const s = String(v);
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
