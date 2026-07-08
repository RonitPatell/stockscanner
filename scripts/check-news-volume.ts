/**
 * One-off volume check: run with `npx tsx scripts/check-news-volume.ts`
 * (or via next console) — imported by a temporary API probe below.
 */
import { fetchMarketNews } from "../src/lib/market-data";

async function main() {
  const articles = await fetchMarketNews({ fast: true });
  const bySource = new Map<string, number>();
  for (const a of articles) {
    bySource.set(a.source, (bySource.get(a.source) ?? 0) + 1);
  }
  console.log(JSON.stringify({
    total: articles.length,
    sources: Object.fromEntries([...bySource.entries()].sort((a, b) => b[1] - a[1])),
    newest: articles[0]
      ? { symbol: articles[0].symbol, headline: articles[0].headline.slice(0, 100), ageMin: Math.round((Date.now() - articles[0].publishedAt.getTime()) / 60000) }
      : null,
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
