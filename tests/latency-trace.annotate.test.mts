import assert from "node:assert/strict";
import test from "node:test";
import { annotateFetchedArticles } from "../src/lib/latency-trace/annotate.ts";
import type { NewsArticle } from "../src/types/index.ts";

test("annotateFetchedArticles stamps fetch window and preserves quality", () => {
  const firstFetchedAt = new Date("2026-07-27T14:00:00.000Z");
  const fetchCompletedAt = new Date("2026-07-27T14:00:01.500Z");
  const publishedAt = new Date("2026-07-27T13:59:50.000Z");

  const articles: NewsArticle[] = [
    {
      id: "rss-1",
      symbol: "AAPL",
      headline: "AAPL announces buyback",
      source: "Benzinga",
      publishedAt,
      trace: {
        providerPublishedAt: publishedAt,
        timestampQuality: "EXACT_PROVIDER",
        parsedAt: publishedAt,
        providerItemId: "rss-1",
      },
    },
  ];

  const out = annotateFetchedArticles(articles, { firstFetchedAt, fetchCompletedAt });
  assert.equal(out.length, 1);
  assert.equal(out[0].trace?.firstFetchedAt?.toISOString(), firstFetchedAt.toISOString());
  assert.equal(out[0].trace?.fetchCompletedAt?.toISOString(), fetchCompletedAt.toISOString());
  assert.equal(out[0].trace?.timestampQuality, "EXACT_PROVIDER");
  assert.equal(out[0].trace?.providerItemId, "rss-1");
});

test("annotateFetchedArticles marks near-now publish as MISSING when untagged", () => {
  const firstFetchedAt = new Date("2026-07-27T14:00:00.000Z");
  const fetchCompletedAt = new Date("2026-07-27T14:00:00.500Z");
  const articles: NewsArticle[] = [
    {
      id: "x-1",
      symbol: "TSLA",
      headline: "TSLA news",
      source: "Unknown",
      publishedAt: new Date(fetchCompletedAt.getTime()),
    },
  ];
  const out = annotateFetchedArticles(articles, { firstFetchedAt, fetchCompletedAt });
  assert.equal(out[0].trace?.timestampQuality, "MISSING");
});
