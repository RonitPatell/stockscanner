/**
 * Resolve 13F issuer → ticker using SEC public SymbolMaster names (no paid API).
 */

import { prisma } from "../prisma.ts";
import { normalizeCusip } from "./compare.ts";

function normalizeIssuerName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(incorporated|inc|corp|corporation|ltd|limited|co|company|plc|sa|ag|nv|llc|lp|holdings|holding)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type ResolveMap = {
  byCusip: Map<string, string>;
  byName: Map<string, string>;
};

let cached: { at: number; map: ResolveMap } | null = null;
const CACHE_MS = 15 * 60_000;

async function loadResolveMap(): Promise<ResolveMap> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.map;

  const rows = await prisma.symbolMaster.findMany({
    select: { symbol: true, name: true },
    take: 20_000,
  });

  const byCusip = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const r of rows) {
    const sym = r.symbol.toUpperCase();
    if (r.name) {
      const n = normalizeIssuerName(r.name);
      if (n && !byName.has(n)) byName.set(n, sym);
    }
  }

  // Optional: cusips stored in metricsJson elsewhere — none yet.
  cached = { at: Date.now(), map: { byCusip, byName } };
  return cached.map;
}

/** Allow tests to inject a static name map without DB. */
export function resolveSymbolFromMaps(
  opts: { cusip?: string | null; issuerName?: string | null },
  maps: { byCusip?: Map<string, string>; byName?: Map<string, string> }
): string | null {
  const cusip = normalizeCusip(opts.cusip);
  if (cusip && maps.byCusip?.has(cusip)) return maps.byCusip.get(cusip)!;
  if (opts.issuerName) {
    const n = normalizeIssuerName(opts.issuerName);
    if (n && maps.byName?.has(n)) return maps.byName.get(n)!;
    // Prefix match for truncated names
    if (n && maps.byName) {
      for (const [key, sym] of maps.byName) {
        if (key.startsWith(n) || n.startsWith(key)) {
          if (Math.min(key.length, n.length) >= 6) return sym;
        }
      }
    }
  }
  return null;
}

export async function resolveHoldingSymbol(opts: {
  cusip?: string | null;
  issuerName?: string | null;
}): Promise<string | null> {
  const maps = await loadResolveMap();
  return resolveSymbolFromMaps(opts, maps);
}

export { normalizeIssuerName };
