import type { CompanyIdentityRecord, CompanyIdentityStore } from "./types.ts";

export function createMemoryIdentityStore(
  seed: CompanyIdentityRecord[] = []
): CompanyIdentityStore {
  const bySymbol = new Map<string, CompanyIdentityRecord>();
  for (const row of seed) {
    bySymbol.set(row.symbol, { ...row });
  }

  return {
    async findBySymbol(symbol) {
      const hit = bySymbol.get(symbol);
      return hit ? { ...hit } : null;
    },
    async findByCik(cik) {
      if (!cik) return [];
      return [...bySymbol.values()]
        .filter((r) => r.cik === cik)
        .map((r) => ({ ...r }));
    },
    async upsert(row) {
      const prev = bySymbol.get(row.symbol);
      const next: CompanyIdentityRecord = {
        symbol: row.symbol,
        name: row.name ?? prev?.name ?? null,
        cik: row.cik ?? prev?.cik ?? null,
        assetType: row.assetType,
        isActive: row.isActive,
        refreshedAt: row.refreshedAt,
      };
      if (row.cik) next.cik = row.cik;
      if (row.name) next.name = row.name;
      bySymbol.set(row.symbol, next);
      return { ...next };
    },
  };
}
