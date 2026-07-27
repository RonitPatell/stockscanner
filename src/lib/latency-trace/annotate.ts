import type { NewsArticle } from "../../types/index.ts";
import {
  fallbackPublishNow,
  parseProviderTimestamp,
} from "./timestamps.ts";
import type { NewsArticleTraceMeta, TimestampQuality } from "./types.ts";

/** Attach fetch-window stamps + fill missing publish quality on a batch. */
export function annotateFetchedArticles(
  articles: NewsArticle[],
  window: { firstFetchedAt: Date; fetchCompletedAt: Date }
): NewsArticle[] {
  const parsedAt = window.fetchCompletedAt;
  return articles.map((a) => {
    const existing = a.trace;
    let quality: TimestampQuality =
      existing?.timestampQuality ??
      (existing?.providerPublishedAt
        ? "ESTIMATED_PROVIDER"
        : a.publishedAt
          ? "ESTIMATED_PROVIDER"
          : "MISSING");

    let providerPublishedAt =
      existing?.providerPublishedAt ?? a.publishedAt ?? null;

    if (!existing?.timestampQuality && a.publishedAt) {
      // If publishedAt is essentially "now", the source likely lacked a stamp.
      const lag = Math.abs(a.publishedAt.getTime() - window.fetchCompletedAt.getTime());
      if (lag < 2_000) {
        quality = "MISSING";
      }
    }

    if (!providerPublishedAt || !Number.isFinite(providerPublishedAt.getTime())) {
      const fb = fallbackPublishNow();
      providerPublishedAt = fb.at ?? new Date();
      quality = "MISSING";
    }

    const publishedAtFinal: Date = providerPublishedAt;

    const trace: NewsArticleTraceMeta = {
      ...existing,
      providerPublishedAt,
      firstFetchedAt: existing?.firstFetchedAt ?? window.firstFetchedAt,
      fetchCompletedAt: existing?.fetchCompletedAt ?? window.fetchCompletedAt,
      parsedAt: existing?.parsedAt ?? parsedAt,
      timestampQuality: quality,
      providerItemId: existing?.providerItemId ?? a.id,
    };

    return {
      ...a,
      publishedAt: publishedAtFinal,
      trace,
    };
  });
}

/** Build publish stamp for RSS-style pubDate strings. */
export function stampFromRssPubDate(pubDate?: string | null): {
  publishedAt: Date;
  trace: Pick<NewsArticleTraceMeta, "providerPublishedAt" | "parsedAt" | "timestampQuality">;
} {
  const parsed = parseProviderTimestamp(pubDate, { fieldKind: "published" });
  if (!parsed.at) {
    const fb = fallbackPublishNow();
    return {
      publishedAt: fb.at!,
      trace: {
        providerPublishedAt: null,
        parsedAt: new Date(),
        timestampQuality: parsed.quality === "INVALID" ? "INVALID" : "MISSING",
      },
    };
  }
  return {
    publishedAt: parsed.at,
    trace: {
      providerPublishedAt: parsed.at,
      parsedAt: new Date(),
      timestampQuality: parsed.quality,
    },
  };
}

export function stampFromUnixSeconds(
  datetime: number | null | undefined
): {
  publishedAt: Date;
  trace: Pick<NewsArticleTraceMeta, "providerPublishedAt" | "parsedAt" | "timestampQuality">;
} {
  const parsed = parseProviderTimestamp(datetime, {
    fieldKind: "published",
    unixUnit: "seconds",
  });
  if (!parsed.at) {
    const fb = fallbackPublishNow();
    return {
      publishedAt: fb.at!,
      trace: {
        providerPublishedAt: null,
        parsedAt: new Date(),
        timestampQuality: parsed.quality,
      },
    };
  }
  return {
    publishedAt: parsed.at,
    trace: {
      providerPublishedAt: parsed.at,
      parsedAt: new Date(),
      timestampQuality: parsed.quality,
    },
  };
}

export function stampFromUpdated(raw?: string | null): {
  publishedAt: Date;
  trace: Pick<NewsArticleTraceMeta, "providerPublishedAt" | "parsedAt" | "timestampQuality">;
} {
  const parsed = parseProviderTimestamp(raw, { fieldKind: "updated" });
  if (!parsed.at) {
    const fb = fallbackPublishNow();
    return {
      publishedAt: fb.at!,
      trace: {
        providerPublishedAt: null,
        parsedAt: new Date(),
        timestampQuality: parsed.quality === "INVALID" ? "INVALID" : "MISSING",
      },
    };
  }
  return {
    publishedAt: parsed.at,
    trace: {
      providerPublishedAt: parsed.at,
      parsedAt: new Date(),
      timestampQuality: parsed.quality,
    },
  };
}
