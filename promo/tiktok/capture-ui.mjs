/**
 * Capture TrustTicker UI screenshots with panel highlights for promo videos.
 * Usage: node promo/tiktok/capture-ui.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(__dirname, "shots");
const BASE = process.env.PROMO_BASE_URL || "http://localhost:3000";

mkdirSync(SHOTS, { recursive: true });

const HIGHLIGHT_CSS = `
  .tt-promo-hl {
    outline: 3px solid #34d399 !important;
    outline-offset: 4px !important;
    box-shadow: 0 0 0 9999px rgba(0,0,0,0.55), 0 0 40px 8px rgba(52,211,153,0.45) !important;
    border-radius: 12px !important;
    position: relative !important;
    z-index: 50 !important;
  }
  .tt-promo-pulse {
    outline: 3px solid #fbbf24 !important;
    outline-offset: 4px !important;
    box-shadow: 0 0 0 9999px rgba(0,0,0,0.55), 0 0 48px 10px rgba(251,191,36,0.5) !important;
    border-radius: 12px !important;
    position: relative !important;
    z-index: 50 !important;
  }
`;

async function shot(page, name) {
  const path = join(SHOTS, `${name}.png`);
  await page.screenshot({ path, fullPage: false, type: "png" });
  console.log("shot", name);
  return path;
}

async function clearHighlight(page) {
  await page.evaluate(() => {
    document.querySelectorAll(".tt-promo-hl, .tt-promo-pulse").forEach((el) => {
      el.classList.remove("tt-promo-hl", "tt-promo-pulse");
    });
  });
}

async function highlightByText(page, text, cls = "tt-promo-hl") {
  await clearHighlight(page);
  const ok = await page.evaluate(
    ({ text, cls }) => {
      const candidates = Array.from(
        document.querySelectorAll("div, section, article, aside, li, header")
      );
      const el = candidates.find((n) => {
        const t = (n.textContent || "").replace(/\s+/g, " ").trim();
        return t.includes(text) && n.getBoundingClientRect().height > 40 && n.getBoundingClientRect().height < 900;
      });
      if (!el) return false;
      // Prefer a reasonably sized parent panel
      let target = el;
      for (let i = 0; i < 4; i++) {
        const p = target.parentElement;
        if (!p) break;
        const r = p.getBoundingClientRect();
        if (r.height > 120 && r.height < 700 && r.width > 200) target = p;
        else break;
      }
      target.classList.add(cls);
      target.scrollIntoView({ block: "center", inline: "nearest" });
      return true;
    },
    { text, cls }
  );
  await page.waitForTimeout(350);
  return ok;
}

async function highlightSelector(page, selector, cls = "tt-promo-hl") {
  await clearHighlight(page);
  const loc = page.locator(selector).first();
  if ((await loc.count()) === 0) return false;
  await loc.evaluate((el, c) => el.classList.add(c), cls);
  await loc.scrollIntoViewIfNeeded();
  await page.waitForTimeout(350);
  return true;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.5,
  });
  const page = await context.newPage();
  await page.addStyleTag({ content: HIGHLIGHT_CSS });

  // Landing
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(800);
  await shot(page, "landing-hero");
  await page.evaluate(() => window.scrollTo(0, 700));
  await page.waitForTimeout(400);
  await shot(page, "landing-features");

  // Demo dashboard
  await page.goto(`${BASE}/demo`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1200);
  await shot(page, "demo-wide");

  await highlightByText(page, "Wire Alerts");
  await shot(page, "demo-wire");

  await highlightByText(page, "Volume Leaders", "tt-promo-pulse");
  await shot(page, "demo-volume");

  await highlightByText(page, "Watchlist Brief");
  await shot(page, "demo-session");

  await highlightByText(page, "Market State", "tt-promo-pulse");
  await shot(page, "demo-judgment");

  // Catalyst feed / news cards on right
  await highlightByText(page, "Catalyst");
  await shot(page, "demo-feed");

  await clearHighlight(page);
  await shot(page, "demo-clean");

  // Today free plan
  await page.goto(`${BASE}/today`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1000);
  await shot(page, "today-full");
  await highlightByText(page, "Setups");
  await shot(page, "today-setups");
  await highlightByText(page, "Skips", "tt-promo-pulse");
  await shot(page, "today-skips");

  // Pricing
  await page.goto(`${BASE}/pricing`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForTimeout(400);
  await shot(page, "pricing-cards");
  await highlightByText(page, "Pro Annual", "tt-promo-hl");
  await shot(page, "pricing-annual");
  await highlightByText(page, "Pro Monthly");
  await shot(page, "pricing-monthly");

  // Wins / proof
  await page.goto(`${BASE}/wins`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1000);
  await shot(page, "wins-proof");

  // Mobile framing pass for vertical crop source
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto(`${BASE}/demo`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1000);
  await shot(page, "demo-mobile");
  await highlightByText(page, "Wire Alerts");
  await shot(page, "demo-mobile-wire");

  await page.goto(`${BASE}/today`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(800);
  await shot(page, "today-mobile");

  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(800);
  await shot(page, "landing-mobile");

  await browser.close();
  console.log("All shots in", SHOTS);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
