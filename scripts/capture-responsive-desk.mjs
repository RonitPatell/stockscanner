import { chromium } from "playwright";
import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.PROMO_BASE_URL || "http://localhost:3000";
const OUTPUT = resolve("artifacts", "responsive-desk");

function readSecret() {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET;
  if (!existsSync(".env")) return "";
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*CRON_SECRET\s*=\s*"?([^"#\r\n]+)"?\s*$/);
    if (match) return match[1].trim();
  }
  return "";
}

function mintToken(secret) {
  const window = Math.floor(Date.now() / 600_000);
  return createHmac("sha256", secret)
    .update(`promo-capture:${window}`)
    .digest("hex");
}

const secret = readSecret();
if (!secret) throw new Error("CRON_SECRET is required for the seeded capture page");

mkdirSync(OUTPUT, { recursive: true });

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "compact", width: 1024, height: 768 },
  { name: "tablet", width: 768, height: 900 },
  { name: "mobile", width: 390, height: 844 },
  { name: "mini", width: 320, height: 720 },
];

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
    });
    await context.addInitScript(() => {
      localStorage.setItem("tt-dashboard-mode", "full");
      localStorage.setItem("tt-alert-nudge-dismissed", "1");
      localStorage.setItem(
        "trustticker:cookie-consent:v1",
        JSON.stringify({ acceptedAt: new Date().toISOString() })
      );
      for (let version = 1; version <= 20; version += 1) {
        localStorage.setItem(`tt-platform-guide-seen-v${version}`, "1");
      }
    });

    const page = await context.newPage();
    const token = mintToken(secret);
    await page.goto(
      `${BASE}/promo/desk-capture?token=${encodeURIComponent(token)}`,
      { waitUntil: "networkidle", timeout: 120_000 }
    );
    await page.waitForSelector('[data-guide="news-feed"]', { timeout: 60_000 });
    await page.keyboard.press("Escape").catch(() => {});
    await page.screenshot({
      path: resolve(OUTPUT, `${viewport.name}-${viewport.width}x${viewport.height}.png`),
      fullPage: false,
    });

    if (viewport.width <= 390) {
      await page.locator('[data-focus-idx="0"] button').first().click();
      await page.waitForTimeout(250);
      await page.screenshot({
        path: resolve(
          OUTPUT,
          `${viewport.name}-expanded-${viewport.width}x${viewport.height}.png`
        ),
        fullPage: false,
      });
    }

    const metrics = await page.evaluate(() => ({
      viewport: { width: innerWidth, height: innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      overflowElements: [...document.querySelectorAll("body *")]
        .filter((element) => {
          const node = element;
          return node.scrollWidth > node.clientWidth + 2;
        })
        .slice(0, 20)
        .map((element) => ({
          tag: element.tagName,
          className: String(element.className).slice(0, 180),
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        })),
    }));
    console.log(JSON.stringify({ name: viewport.name, ...metrics }));
    await context.close();
  }
} finally {
  await browser.close();
}
