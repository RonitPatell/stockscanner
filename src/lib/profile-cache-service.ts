import { finnhubFetchLive } from "./finnhub-queue";
import { resolveFinnhubKey } from "./finnhub-key";
import { isValidTickerFormat } from "./ticker-utils";
import { getRedis } from "./redis";

export interface CachedProfile {
  floatShares: number;
  marketCap: number;
}

const PROFILES_KEY = "profiles:v1";
const PROFILE_TTL_SEC = 86_400;
const PROFILE_CONCURRENCY = 4;

type MemoryProfiles = { ts: number; profiles: Record<string, CachedProfile> };

const globalStore = globalThis as typeof globalThis & {
  __trustProfileCache?: MemoryProfiles;
};

function memoryProfiles(): MemoryProfiles {
  if (!globalStore.__trustProfileCache) {
    globalStore.__trustProfileCache = { ts: 0, profiles: {} };
  }
  return globalStore.__trustProfileCache;
}

async function persistProfiles(profiles: Record<string, CachedProfile>): Promise<void> {
  memoryProfiles().profiles = { ...memoryProfiles().profiles, ...profiles };
  memoryProfiles().ts = Date.now();

  const redis = getRedis();
  if (redis && Object.keys(profiles).length > 0) {
    try {
      const merged = {
        ...(await redis.get<Record<string, CachedProfile>>(PROFILES_KEY)),
        ...profiles,
      };
      await redis.set(PROFILES_KEY, merged, { ex: PROFILE_TTL_SEC });
    } catch {
      /* memory ok */
    }
  }
}

export async function getCachedProfiles(
  symbols: string[]
): Promise<Record<string, CachedProfile>> {
  const wanted = [...new Set(symbols.map((s) => s.toUpperCase()))].filter(isValidTickerFormat);
  if (wanted.length === 0) return {};

  const out: Record<string, CachedProfile> = {};
  const redis = getRedis();
  if (redis) {
    try {
      const all = await redis.get<Record<string, CachedProfile>>(PROFILES_KEY);
      if (all && typeof all === "object") {
        for (const sym of wanted) {
          if (all[sym]) out[sym] = all[sym];
        }
      }
    } catch {
      /* fall through */
    }
  }

  const mem = memoryProfiles();
  for (const sym of wanted) {
    if (!out[sym] && mem.profiles[sym]) out[sym] = mem.profiles[sym];
  }

  return out;
}

async function fetchProfile(symbol: string): Promise<CachedProfile | null> {
  const key = resolveFinnhubKey();
  if (!key) return null;

  try {
    const res = await finnhubFetchLive(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(4_500) }
    );
    if (!res.ok) return null;
    const profile = await res.json();
    if (!profile?.ticker) return null;

    const marketCap = profile.marketCapitalization
      ? profile.marketCapitalization * 1e6
      : null;
    const floatShares = profile.shareOutstanding
      ? profile.shareOutstanding * 1e6 * 0.7
      : null;

    if (!marketCap && !floatShares) return null;

    return {
      marketCap: marketCap ?? 0,
      floatShares: floatShares ?? 0,
    };
  } catch {
    return null;
  }
}

/** Backfill float / market cap — long-lived cache, live Finnhub path. */
export async function refreshProfileCache(symbols: string[]): Promise<number> {
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()))]
    .filter(isValidTickerFormat)
    .slice(0, 24);

  if (unique.length === 0) return 0;

  const existing = await getCachedProfiles(unique);
  const missing = unique.filter((s) => !existing[s]);
  if (missing.length === 0) return 0;

  const profiles: Record<string, CachedProfile> = { ...existing };
  let updated = 0;
  let index = 0;

  await Promise.all(
    Array.from({ length: Math.min(PROFILE_CONCURRENCY, missing.length) }, async () => {
      while (index < missing.length) {
        const sym = missing[index++];
        const hit = await fetchProfile(sym);
        if (!hit) continue;
        profiles[sym] = hit;
        updated++;
      }
    })
  );

  await persistProfiles(profiles);
  return updated;
}
