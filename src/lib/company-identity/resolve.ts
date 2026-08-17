/**
 * resolveCompanyIdentity(symbol) — canonical ticker/CIK/name via SymbolMaster.
 * Never fabricates CIKs. CompanyFacts availability is a later dataset, not identity.
 */

import { classifyAssetType } from "../coverage/asset-type.ts";
import { ACTIVE_US_TICKERS } from "../news-sources/active-tickers.ts";
import { normalizeCik, normalizeSymbol, isUsTickerSymbol } from "./normalize.ts";
import { loadSecCompanyTickerMap } from "./sec-tickers.ts";
import type {
  CompanyIdentityRecord,
  CompanyIdentityResult,
  CompanyIdentityStore,
  ResolveCompanyIdentityOptions,
  SecTickerMapResult,
} from "./types.ts";

const locks = new Map<string, Promise<unknown>>();

function withSymbolLock<T>(symbol: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(symbol) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  locks.set(
    symbol,
    run.then(
      () => undefined,
      () => undefined
    )
  );
  return run;
}

function result(partial: CompanyIdentityResult): CompanyIdentityResult {
  return partial;
}

async function getStore(
  store?: CompanyIdentityStore
): Promise<CompanyIdentityStore> {
  if (store) return store;
  const { createPrismaIdentityStore } = await import("./prisma-store.ts");
  return createPrismaIdentityStore();
}

async function loadMapping(
  opts: ResolveCompanyIdentityOptions
): Promise<SecTickerMapResult> {
  if (opts.mapping === "unavailable") {
    return {
      ok: false,
      byTicker: new Map(),
      byCik: new Map(),
      fetchedAt: Date.now(),
      errorCode: "network",
    };
  }
  if (opts.mapping) return opts.mapping;
  return loadSecCompanyTickerMap();
}

function pickCanonical(
  requested: CompanyIdentityRecord | null,
  cikSiblings: CompanyIdentityRecord[]
): { record: CompanyIdentityRecord; aliasedFrom: string | null } | null {
  if (!requested) return null;
  if (requested.isActive) {
    return { record: requested, aliasedFrom: null };
  }
  const active = cikSiblings.find(
    (r) => r.isActive && r.symbol !== requested.symbol && r.cik && r.cik === requested.cik
  );
  if (active) {
    return { record: active, aliasedFrom: requested.symbol };
  }
  return { record: requested, aliasedFrom: null };
}

export async function resolveCompanyIdentity(
  raw: string,
  opts: ResolveCompanyIdentityOptions = {}
): Promise<CompanyIdentityResult> {
  const requestedSymbol = normalizeSymbol(raw);
  const persist = opts.persist !== false;
  const now = opts.now ?? new Date();

  if (!requestedSymbol || !isUsTickerSymbol(requestedSymbol)) {
    return result({
      status: "NOT_FOUND",
      requestedSymbol: requestedSymbol || String(raw ?? "").trim(),
      symbol: null,
      cik: null,
      name: null,
      assetType: null,
      source: "none",
      aliasedFrom: null,
      persisted: false,
      mappingAvailable: true,
      code: "INVALID_SYMBOL",
      message: "Not a valid US ticker symbol.",
    });
  }

  return withSymbolLock(requestedSymbol, async () => {
    try {
      const store = await getStore(opts.store);
      const existing = await store.findBySymbol(requestedSymbol);
      const existingCik = normalizeCik(existing?.cik);

      if (existing && existingCik) {
        const siblings = await store.findByCik(existingCik);
        const picked = pickCanonical(existing, siblings) ?? {
          record: existing,
          aliasedFrom: null,
        };
        return result({
          status: "READY",
          requestedSymbol,
          symbol: picked.record.symbol,
          cik: existingCik,
          name: picked.record.name,
          assetType: picked.record.assetType,
          source: "symbol_master",
          aliasedFrom: picked.aliasedFrom,
          persisted: false,
          mappingAvailable: true,
          code: "OK",
          message: "SEC identity is ready.",
        });
      }

      const mapping = await loadMapping(opts);

      if (mapping.ok) {
        const mapped = mapping.byTicker.get(requestedSymbol);
        if (mapped?.cik) {
          const assetType = classifyAssetType(requestedSymbol, mapped.title);
          let persisted = false;
          let saved: CompanyIdentityRecord | null = existing;
          if (persist) {
            saved = await store.upsert({
              symbol: requestedSymbol,
              name: mapped.title,
              cik: mapped.cik,
              assetType,
              isActive: true,
              refreshedAt: now,
            });
            persisted = true;
          }
          return result({
            status: "READY",
            requestedSymbol,
            symbol: requestedSymbol,
            cik: mapped.cik,
            name: saved?.name ?? mapped.title,
            assetType,
            source: existing ? "symbol_master" : "sec_mapping",
            aliasedFrom: null,
            persisted,
            mappingAvailable: true,
            code: "OK",
            message: "SEC identity resolved from the company ticker map.",
          });
        }
      }

      if (existing) {
        return result({
          status: "NO_CIK",
          requestedSymbol,
          symbol: existing.symbol,
          cik: null,
          name: existing.name,
          assetType: existing.assetType,
          source: "symbol_master",
          aliasedFrom: null,
          persisted: false,
          mappingAvailable: mapping.ok,
          code: mapping.ok ? "NO_CIK" : "MAPPING_UNAVAILABLE",
          message: mapping.ok
            ? "Ticker is known but no SEC CIK is available."
            : "Ticker is known; SEC ticker map is temporarily unavailable and CIK is missing.",
        });
      }

      const curated = ACTIVE_US_TICKERS.includes(requestedSymbol);
      if (curated) {
        const assetType = classifyAssetType(requestedSymbol, null);
        let persisted = false;
        if (persist) {
          await store.upsert({
            symbol: requestedSymbol,
            name: null,
            cik: null,
            assetType,
            isActive: true,
            refreshedAt: now,
          });
          persisted = true;
        }
        return result({
          status: "NO_CIK",
          requestedSymbol,
          symbol: requestedSymbol,
          cik: null,
          name: null,
          assetType,
          source: "curated",
          aliasedFrom: null,
          persisted,
          mappingAvailable: mapping.ok,
          code: mapping.ok ? "NO_CIK" : "MAPPING_UNAVAILABLE",
          message: mapping.ok
            ? "Ticker is on the curated list but has no SEC CIK in the mapping."
            : "Ticker is on the curated list; SEC ticker map is temporarily unavailable and CIK is missing.",
        });
      }

      if (!mapping.ok) {
        return result({
          status: "ERROR",
          requestedSymbol,
          symbol: null,
          cik: null,
          name: null,
          assetType: null,
          source: "none",
          aliasedFrom: null,
          persisted: false,
          mappingAvailable: false,
          code: "MAPPING_UNAVAILABLE",
          message: "SEC ticker map is temporarily unavailable.",
        });
      }

      return result({
        status: "NOT_FOUND",
        requestedSymbol,
        symbol: null,
        cik: null,
        name: null,
        assetType: null,
        source: "none",
        aliasedFrom: null,
        persisted: false,
        mappingAvailable: true,
        code: "UNKNOWN_SYMBOL",
        message: "No SEC company identity found for this ticker.",
      });
    } catch {
      return result({
        status: "ERROR",
        requestedSymbol,
        symbol: null,
        cik: null,
        name: null,
        assetType: null,
        source: "none",
        aliasedFrom: null,
        persisted: false,
        mappingAvailable: opts.mapping !== "unavailable",
        code: "STORE_ERROR",
        message: "Could not resolve company identity.",
      });
    }
  });
}

export function __resetIdentityLocksForTests(): void {
  locks.clear();
}
