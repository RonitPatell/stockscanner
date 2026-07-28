/**
 * Story clustering — attach metadata + collapse cross-source duplicates.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  attachStoryClusters,
  collapseStoryClusters,
  storyClusterKey,
  storyDedupeKey,
} from "../src/lib/story-cluster.ts";
import type { CatalystItem } from "../src/types/index.ts";

function item(
  over: Partial<CatalystItem> & Pick<CatalystItem, "id" | "symbol" | "headline" | "source">
): CatalystItem {
  return {
    publishedAt: "2026-07-27T14:00:00.000Z",
    urgencyScore: 50,
    verifiedConfidence: 70,
    ...over,
  };
}

test("storyClusterKey normalizes similar headlines", () => {
  const a = storyClusterKey("Company Announces FDA Approval for Drug X");
  const b = storyClusterKey("Company announces FDA approval for drug X!");
  assert.equal(a, b);
});

test("collapseStoryClusters keeps one row per ticker+story", () => {
  const items = [
    item({
      id: "a",
      symbol: "ABCD",
      headline: "Acme announces registered direct offering",
      source: "PR Newswire",
      urgencyScore: 40,
    }),
    item({
      id: "b",
      symbol: "ABCD",
      headline: "Acme Announces Registered Direct Offering",
      source: "Business Wire",
      urgencyScore: 80,
      publishedAt: "2026-07-27T14:01:00.000Z",
    }),
    item({
      id: "c",
      symbol: "WXYZ",
      headline: "Acme announces registered direct offering",
      source: "GlobeNewswire",
    }),
  ];

  const collapsed = collapseStoryClusters(items);
  assert.equal(collapsed.length, 2);
  const abcd = collapsed.find((c) => c.symbol === "ABCD");
  assert.ok(abcd);
  assert.equal(abcd!.id, "b"); // higher urgency
  assert.ok((abcd!.newsCount ?? 0) >= 2);
  assert.ok(collapsed.some((c) => c.symbol === "WXYZ"));
});

test("attachStoryClusters does not remove rows", () => {
  const items = [
    item({
      id: "1",
      symbol: "AAA",
      headline: "Same story wire one",
      source: "A",
    }),
    item({
      id: "2",
      symbol: "AAA",
      headline: "Same story wire two",
      source: "B",
    }),
  ];
  // Different first-8 significant words → may not cluster; force same key
  const forced = items.map((c) => ({
    ...c,
    headline: "Acme Therapeutics announces major partnership deal today",
  }));
  const attached = attachStoryClusters(forced);
  assert.equal(attached.length, 2);
  assert.equal(attached[0]!.storyClusterId, attached[1]!.storyClusterId);
});

test("storyDedupeKey is symbol-scoped", () => {
  const a = item({
    id: "1",
    symbol: "aaa",
    headline: "Hello world news event today",
    source: "X",
    storyClusterId: "hello-world-news-event",
  });
  const b = { ...a, symbol: "bbb", id: "2" };
  assert.notEqual(storyDedupeKey(a), storyDedupeKey(b));
  assert.match(storyDedupeKey(a), /^AAA\|/);
});
