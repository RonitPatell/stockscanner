import type { HaltProvider, HaltProviderEvent } from "../types.ts";
import { normalizeHaltCode } from "../codes.ts";

/**
 * Licensed real-time LULD / halt events provider.
 * Configure HALT_LICENSED_LULD_URL. When unset, returns [].
 * Disagreements with official source are reconciled upstream — never preferred
 * for official resumption times.
 */
export function createLicensedLuldProvider(opts?: {
  fetchImpl?: typeof fetch;
  url?: string | null;
}): HaltProvider {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  return {
    id: "licensed_luld",
    kind: "licensed_luld",
    lastSuccessAt: null,
    async fetchHalts(symbols?: string[]): Promise<HaltProviderEvent[]> {
      const url = opts?.url ?? process.env.HALT_LICENSED_LULD_URL ?? null;
      if (!url) return [];

      try {
        const res = await fetchImpl(url, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return [];
        const json = (await res.json()) as {
          items?: Record<string, unknown>[];
        };
        const want = symbols?.map((s) => s.toUpperCase());
        const out: HaltProviderEvent[] = [];
        for (const row of json.items ?? []) {
          const symbol = String(row.symbol ?? "")
            .toUpperCase()
            .trim();
          if (!symbol) continue;
          if (want && !want.includes(symbol)) continue;
          const eventAt = String(row.eventAt ?? row.ts ?? "");
          if (!eventAt || !Number.isFinite(Date.parse(eventAt))) continue;

          // Licensed feed may carry estimated resume hints — we intentionally
          // DO NOT map them into officialResumption* fields.
          out.push({
            symbol,
            exchange: row.exchange ? String(row.exchange) : null,
            haltCode: normalizeHaltCode(
              String(row.code ?? row.luldCode ?? row.haltCode ?? "T5")
            ),
            haltReason: row.reason ? String(row.reason) : "LULD / licensed halt event",
            eventAt: new Date(eventAt).toISOString(),
            lifecycle: (row.lifecycle as HaltProviderEvent["lifecycle"]) ?? null,
            newsDisseminationStatus: null,
            officialResumptionQuoteAt: null,
            officialResumptionTradeAt: null,
            lastPriceBeforeHalt:
              row.lastPrice != null ? Number(row.lastPrice) : null,
            lastSpreadBeforeHalt:
              row.spread != null ? Number(row.spread) : null,
            volumeBeforeHalt: row.volume != null ? Number(row.volume) : null,
            source: "licensed_luld",
            sourceKind: "licensed_luld",
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

/** In-memory provider for tests / fixtures. */
export function createFixtureProvider(
  events: HaltProviderEvent[],
  kind: HaltProvider["kind"] = "official_exchange"
): HaltProvider {
  return {
    id: `fixture_${kind}`,
    kind,
    async fetchHalts(symbols?: string[]) {
      const want = symbols?.map((s) => s.toUpperCase());
      return events.filter(
        (e) => !want || want.includes(e.symbol.toUpperCase())
      );
    },
  };
}
