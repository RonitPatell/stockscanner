import { createHash } from "node:crypto";

const PUBLISH_WINDOW_MS = 5 * 60_000;

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

export function canonicalUrl(url: string | null | undefined): string {
  if (!url?.trim()) return "";
  try {
    const u = new URL(url.trim());
    u.hash = "";
    // Drop common tracking params
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_)/i.test(key)) u.searchParams.delete(key);
    }
    return u.toString().toLowerCase();
  } catch {
    return url.trim().toLowerCase().split("#")[0] ?? "";
  }
}

export function publishWindow(publishedAt: Date | null | undefined): number {
  if (!publishedAt || !Number.isFinite(publishedAt.getTime())) return 0;
  return Math.floor(publishedAt.getTime() / PUBLISH_WINDOW_MS);
}

/**
 * Idempotency key from provider ID, canonical URL, normalized title,
 * ticker, and publication window — stable across duplicate workers.
 */
export function buildIdempotencyKey(input: {
  providerItemId?: string | null;
  url?: string | null;
  title: string;
  ticker: string;
  publishedAt?: Date | null;
}): string {
  const parts = [
    (input.providerItemId ?? "").trim(),
    canonicalUrl(input.url),
    normalizeTitle(input.title),
    (input.ticker ?? "").toUpperCase().trim(),
    String(publishWindow(input.publishedAt)),
  ].join("|");
  return createHash("sha256").update(parts).digest("hex").slice(0, 40);
}
