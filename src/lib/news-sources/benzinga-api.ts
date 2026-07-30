import type { NewsArticle } from "@/types";
import { hashStr } from "./rss-utils";
import { parseProviderTimestamp, fallbackPublishNow } from "../latency-trace";

/**
 * Benzinga Cloud News + Press Releases — primary paid low-latency wire.
 *
 * Stock Titan does not license their feed. Benzinga Newsfeed + Press Releases
 * is the industry desk equivalent (same class Webull/retail platforms license).
 *
 * Env:
 *   BENZINGA_API_KEY          required
 *   BENZINGA_API_BASE         optional (default https://api.benzinga.com/api/v2/news)
 *   BENZINGA_CHANNELS         optional comma list (e.g. "WIIM,Earnings")
 *   BENZINGA_INCLUDE_PRS=0    disable press-release channel pass
 */

let updatedSinceSec = 0;
let lastSuccessAt = 0;

export function getBenzingaWireHealth(): {
  configured: boolean;
  updatedSinceSec: number;
  lastSuccessAt: number;
} {
  return {
    configured: Boolean(process.env.BENZINGA_API_KEY?.trim()),
    updatedSinceSec,
    lastSuccessAt,
  };
}

function mapRow(row: Record<string, unknown>, sourceLabel: string): NewsArticle | null {
  const headline = String(row.title ?? row.headline ?? "").trim();
  if (!headline) return null;

  const stocks = Array.isArray(row.stocks)
    ? (row.stocks as { name?: string }[])
        .map((s) => String(s?.name ?? "").toUpperCase().replace(/[^A-Z.]/g, ""))
        .filter((s) => s.length >= 1 && s.length <= 8)
    : [];
  const symbol = stocks[0] || "SPY";
  const hasCreated = typeof row.created === "string";
  const hasUpdated = typeof row.updated === "string";
  const parsed = hasCreated
    ? parseProviderTimestamp(String(row.created), { fieldKind: "created" })
    : hasUpdated
      ? parseProviderTimestamp(String(row.updated), { fieldKind: "updated" })
      : fallbackPublishNow();

  const idRaw = String(row.id ?? row.url ?? headline);
  const link = typeof row.url === "string" ? row.url : undefined;

  // Advance watermark from provider updated/created
  const stamp = hasUpdated
    ? Date.parse(String(row.updated))
    : hasCreated
      ? Date.parse(String(row.created))
      : NaN;
  if (Number.isFinite(stamp)) {
    const sec = Math.floor(stamp / 1000);
    if (sec > updatedSinceSec) updatedSinceSec = sec;
  }

  return {
    id: `bz:${hashStr(idRaw)}`,
    symbol: symbol.slice(0, 8),
    headline: headline.slice(0, 280),
    source: sourceLabel,
    url: link,
    publishedAt: parsed.at ?? new Date(),
    summary:
      typeof row.teaser === "string"
        ? row.teaser.slice(0, 400)
        : typeof row.body === "string"
          ? row.body.slice(0, 400)
          : undefined,
    trace: {
      providerPublishedAt: parsed.at,
      parsedAt: new Date(),
      timestampQuality: parsed.quality,
      providerItemId: String(row.id ?? idRaw),
    },
  };
}

async function fetchBenzingaPage(opts: {
  limit: number;
  channels?: string;
  label: string;
}): Promise<NewsArticle[]> {
  const key = process.env.BENZINGA_API_KEY?.trim();
  if (!key) return [];

  const base =
    process.env.BENZINGA_API_BASE?.trim() ||
    "https://api.benzinga.com/api/v2/news";

  const url = new URL(base);
  url.searchParams.set(
    "pageSize",
    String(Math.min(100, Math.max(1, opts.limit)))
  );
  url.searchParams.set("displayOutput", "abstract");
  if (opts.channels) url.searchParams.set("channels", opts.channels);
  // Delta poll when we have a watermark (faster + fewer dupes)
  if (updatedSinceSec > 0) {
    // Small overlap so we don't miss boundary items
    url.searchParams.set(
      "updatedSince",
      String(Math.max(0, updatedSinceSec - 5))
    );
  }

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      Authorization: `token ${key}`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `Benzinga auth failed (${res.status}). Check BENZINGA_API_KEY / plan entitlements.`
    );
  }
  if (res.status === 429) {
    throw new Error("Benzinga rate limited (429) — backing off via circuit breaker");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(
      `[benzinga] HTTP ${res.status} ${opts.label}`,
      body.slice(0, 200)
    );
    throw new Error(`Benzinga HTTP ${res.status}`);
  }

  const data = (await res.json()) as unknown;
  const rows = Array.isArray(data) ? data : [];
  const out: NewsArticle[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const mapped = mapRow(row as Record<string, unknown>, opts.label);
    if (mapped) out.push(mapped);
  }
  lastSuccessAt = Date.now();
  return out;
}

/**
 * Combined wire: equities news + press releases (Stock-Titan-class coverage).
 */
export async function fetchBenzingaApiNews(limit = 50): Promise<NewsArticle[]> {
  const key = process.env.BENZINGA_API_KEY?.trim();
  if (!key) return [];

  const extraChannels = (process.env.BENZINGA_CHANNELS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const includePrs = process.env.BENZINGA_INCLUDE_PRS !== "0";

  const passes: { channels?: string; label: string; limit: number }[] = [
    { label: "Benzinga API", limit },
  ];
  if (includePrs) {
    passes.push({
      channels: "Press Releases",
      label: "Benzinga Press Releases",
      limit: Math.min(40, limit),
    });
  }
  for (const ch of extraChannels) {
    passes.push({
      channels: ch,
      label: `Benzinga ${ch}`,
      limit: Math.min(30, limit),
    });
  }

  const seen = new Set<string>();
  const out: NewsArticle[] = [];
  const errors: string[] = [];

  await Promise.all(
    passes.map(async (pass) => {
      try {
        const items = await fetchBenzingaPage(pass);
        for (const item of items) {
          if (seen.has(item.id)) continue;
          seen.add(item.id);
          out.push(item);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${pass.label}: ${msg}`);
        console.error(`[benzinga] ${pass.label} failed:`, msg);
      }
    })
  );

  // If every pass failed and we have a key, surface so circuit breaker trips
  if (out.length === 0 && errors.length === passes.length) {
    throw new Error(errors[0] || "Benzinga wire failed");
  }

  out.sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
  return out.slice(0, Math.max(limit, 80));
}
