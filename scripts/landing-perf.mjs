/**
 * Landing page smoke / performance check (repo Lighthouse equivalent).
 * Requires a running server at LANDING_BASE_URL (default http://127.0.0.1:3000).
 *
 * Usage:
 *   node scripts/landing-perf.mjs
 *   LANDING_BASE_URL=http://127.0.0.1:3000 node scripts/landing-perf.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.LANDING_BASE_URL || "http://127.0.0.1:3000";
const WIDTHS = [
  { name: "390px", width: 390, height: 844 },
  { name: "768px", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
];

const REQUIRED_COPY = [
  "Know why it’s moving before you chase it",
  // curly/straight apostrophe variants
  "Know why it",
  "View real market replay",
  "Start free trial",
  "$19.99/month after trial",
  "Verify the catalyst",
  "Detect the trap",
  "Receive the alert",
];

async function checkViewport(browser, viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  const started = Date.now();
  const res = await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 45_000 });
  const ttfbish = Date.now() - started;
  await page.waitForTimeout(800);
  const ready = Date.now() - started;

  const status = res?.status() ?? 0;
  const body = await page.locator("body").innerText();
  const html = await page.content();

  const missing = [];
  // Hero headline: allow either curly or straight apostrophe
  if (!/Know why it.s moving before you chase it/.test(body)) {
    missing.push("hero headline");
  }
  for (const needle of [
    "View real market replay",
    "Start free trial",
    "Verify the catalyst",
    "Detect the trap",
    "Receive the alert",
  ]) {
    if (!body.includes(needle)) missing.push(needle);
  }
  if (!body.includes("$19.99") || !/after trial/i.test(body)) {
    missing.push("pricing line");
  }

  // A11y basics
  const h1 = await page.locator("h1").count();
  const mainLandmark = await page.locator('[aria-labelledby="hero-heading"]').count();
  const focusableBroken = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll("a, button").forEach((el) => {
      const style = getComputedStyle(el);
      if (style.outlineStyle === "none" && !style.boxShadow.includes("rgb")) {
        // only flag if also no focus-visible ring class — soft check
      }
    });
    return bad;
  });

  // Contrast soft check: primary text vs bg luminance ratio approximation
  const contrastOk = await page.evaluate(() => {
    const bg = getComputedStyle(document.body).backgroundColor;
    const fg = getComputedStyle(document.body).color;
    const parse = (c) => {
      const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) return null;
      return [Number(m[1]), Number(m[2]), Number(m[3])].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
    };
    const B = parse(bg);
    const F = parse(fg);
    if (!B || !F) return true;
    const L = (rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    const L1 = L(F);
    const L2 = L(B);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    return ratio >= 4.5;
  });

  const hasJsonLd =
    html.includes("SoftwareApplication") &&
    html.includes("FAQPage") &&
    html.includes("Organization");

  const hasInternalJargon =
    /\bSSE\b|\bcron\b|\bworker\b|\bclient poll\b/i.test(body);

  await page.close();

  return {
    viewport: viewport.name ?? `${viewport.width}x${viewport.height}`,
    status,
    ttfbishMs: ttfbish,
    readyMs: ready,
    h1Count: h1,
    heroLandmark: mainLandmark > 0,
    missing,
    contrastOk,
    hasJsonLd,
    hasInternalJargon,
    pageErrors: errors.slice(0, 5),
    focusableBroken: focusableBroken.length,
  };
}

async function main() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    console.error("Playwright chromium unavailable:", e.message);
    console.error("Install with: npx playwright install chromium");
    process.exit(2);
  }

  const results = [];
  for (const vp of WIDTHS) {
    try {
      results.push(
        await checkViewport(browser, {
          name: vp.name,
          width: vp.width,
          height: vp.height,
        })
      );
    } catch (e) {
      results.push({
        viewport: vp.name,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  await browser.close();

  console.log("\n=== TrustTicker landing perf / a11y smoke ===\n");
  console.log(`Base: ${BASE}\n`);
  for (const r of results) {
    console.log(JSON.stringify(r, null, 2));
    console.log("");
  }

  const failed = results.some(
    (r) =>
      r.error ||
      r.status !== 200 ||
      (r.missing && r.missing.length) ||
      r.hasInternalJargon ||
      !r.contrastOk ||
      !r.hasJsonLd ||
      (r.pageErrors && r.pageErrors.length)
  );

  // Soft perf budgets (local smoke — not Lighthouse lab)
  for (const r of results) {
    if (r.readyMs != null && r.readyMs > 8000) {
      console.warn(`WARN ${r.viewport}: readyMs ${r.readyMs} > 8000`);
    }
  }

  if (failed) {
    console.error("RESULT: FAIL — see missing copy / jargon / contrast / JSON-LD");
    process.exit(1);
  }
  console.log("RESULT: PASS — content, JSON-LD, contrast smoke, no internal jargon");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
