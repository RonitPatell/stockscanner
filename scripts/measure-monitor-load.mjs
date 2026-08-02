import { chromium } from "playwright";

const url =
  process.argv[2] ??
  "http://localhost:3000/e2e/monitor-harness?scenario=emerging";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const t0 = Date.now();
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
const wallHtmlMs = Date.now() - t0;
await page.waitForTimeout(1200);
const marks = await page.evaluate(() => {
  const perf = window.__MONITOR_PERF__ || [];
  const nav = performance.getEntriesByType("navigation")[0];
  const entries = performance
    .getEntriesByType("mark")
    .filter((m) => m.name.startsWith("monitor_"));
  const measures = performance
    .getEntriesByType("measure")
    .filter((m) => m.name.startsWith("monitor_"));
  return {
    __MONITOR_PERF__: perf,
    marks: entries.map((e) => ({
      name: e.name,
      startTime: Math.round(e.startTime),
    })),
    measures: measures.map((e) => ({
      name: e.name,
      duration: Math.round(e.duration),
    })),
    nav: nav
      ? {
          responseStart: Math.round(nav.responseStart),
          domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
          loadEventEnd: Math.round(nav.loadEventEnd),
          transferSize: nav.transferSize,
        }
      : null,
  };
});
const tickerVisible = await page
  .locator("[data-testid='ladder-row'], [data-symbol]")
  .first()
  .isVisible()
  .catch(() => false);
console.log(JSON.stringify({ url, wallHtmlMs, tickerVisible, ...marks }, null, 2));
await browser.close();
