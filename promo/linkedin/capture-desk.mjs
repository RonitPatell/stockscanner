/**
 * Capture the REAL TradingDashboard (Pro desk) for the LinkedIn epic video.
 * Usage: node --env-file=.env promo/linkedin/capture-desk.mjs
 * Requires: dev server running (npm run dev) and CRON_SECRET in .env
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { createHmac } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(__dirname, "shots");
const BASE = process.env.PROMO_BASE_URL || "http://localhost:3000";

let SECRET = process.env.CRON_SECRET || "";
if (!SECRET) {
  // Fallback: parse .env at repo root manually
  const envPath = resolve(__dirname, "..", "..", ".env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*CRON_SECRET\s*=\s*"?([^"#\r\n]+)"?\s*$/);
      if (m) SECRET = m[1].trim();
    }
  }
}
if (!SECRET) {
  console.error("CRON_SECRET not found in env or .env — cannot open capture page");
  process.exit(1);
}

function mintPromoToken(secret) {
  const window = Math.floor(Date.now() / 600_000);
  return createHmac("sha256", secret).update(`promo-capture:${window}`).digest("hex");
}

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
`;

async function shot(page, name) {
  const path = join(SHOTS, `${name}.png`);
  await page.screenshot({ path, fullPage: false, type: "png" });
  console.log("shot", name);
}

async function clearHighlight(page) {
  await page.evaluate(() => {
    document
      .querySelectorAll(".tt-promo-hl")
      .forEach((el) => el.classList.remove("tt-promo-hl"));
  });
  await page.waitForTimeout(200);
}

async function highlightSelector(page, selector) {
  await clearHighlight(page);
  const ok = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    el.classList.add("tt-promo-hl");
    el.scrollIntoView({ block: "center", inline: "nearest" });
    return true;
  }, selector);
  await page.waitForTimeout(400);
  return ok;
}

/** Highlight the panel (PanelShell) whose header contains the given text. */
async function highlightPanelByTitle(page, title) {
  await clearHighlight(page);
  const ok = await page.evaluate((title) => {
    const headers = Array.from(document.querySelectorAll("div, header, h2, h3"));
    const label = headers.find((n) => {
      const t = (n.textContent || "").trim();
      return (
        t.startsWith(title) &&
        t.length < title.length + 40 &&
        n.getBoundingClientRect().height < 60
      );
    });
    if (!label) return false;
    let target = label;
    for (let i = 0; i < 6; i++) {
      const p = target.parentElement;
      if (!p) break;
      const r = p.getBoundingClientRect();
      if (r.height > 160 && r.width > 240) {
        target = p;
        break;
      }
      target = p;
    }
    target.classList.add("tt-promo-hl");
    target.scrollIntoView({ block: "center", inline: "nearest" });
    return true;
  }, title);
  await page.waitForTimeout(400);
  return ok;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });

  // Pre-seed localStorage: advanced layout, platform guide dismissed
  await context.addInitScript(() => {
    try {
      localStorage.setItem("tt-dashboard-mode", "advanced");
      for (let v = 1; v <= 20; v++) {
        localStorage.setItem(`tt-platform-guide-seen-v${v}`, "1");
      }
      localStorage.setItem("tt-alert-nudge-dismissed", "1");
      localStorage.setItem(
        "trustticker:cookie-consent:v1",
        JSON.stringify({ acceptedAt: new Date().toISOString() })
      );
    } catch {}
  });

  const page = await context.newPage();
  const token = mintPromoToken(SECRET);
  const url = `${BASE}/promo/desk-capture?token=${encodeURIComponent(token)}`;
  console.log("loading", `${BASE}/promo/desk-capture`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });

  // Wait for the desk to actually paint (wire alerts panel present)
  await page.waitForSelector('[data-guide="market-monitor"]', { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.addStyleTag({ content: HIGHLIGHT_CSS });

  // Close any overlay/onboarding that slipped through
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(300);

  // Fill panels that need live APIs with realistic static values so promo
  // shots never show "Starting", empty boards, or loading placeholders.
  await page.evaluate(() => {
    const quotes = {
      VIX: [14.2, -2.1],
      SPY: [582.4, 0.42],
      QQQ: [512.8, 0.68],
      IWM: [224.6, 1.12],
      DIA: [428.9, 0.21],
      XLK: [248.1, 0.91],
      XLF: [47.3, -0.18],
      XLE: [92.4, 0.34],
      XLV: [151.2, 0.12],
      XLI: [138.7, 0.45],
      XLY: [204.3, 0.77],
      XLP: [81.9, -0.08],
      XLC: [98.6, 0.53],
      XLU: [77.4, 0.15],
      XLB: [94.1, 0.28],
    };
    document.querySelectorAll("div.flex.items-center.justify-between").forEach((rowEl) => {
      const symEl = rowEl.querySelector("span.font-mono.font-bold");
      const sym = symEl?.textContent?.trim();
      if (!sym || !(sym in quotes)) return;
      const [price, pct] = quotes[sym];
      const nums = rowEl.querySelectorAll("div span");
      if (nums.length < 2) return;
      nums[0].textContent = price.toFixed(2);
      nums[1].textContent = `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
      nums[1].classList.remove("text-red-400", "text-emerald-400");
      nums[1].classList.add(pct >= 0 ? "text-emerald-400" : "text-red-400");
    });

    // Earnings panel: replace "Loading earnings…" placeholder with rows
    const loadingP = Array.from(document.querySelectorAll("p")).find((p) =>
      (p.textContent || "").includes("Loading earnings")
    );
    if (loadingP) {
      const rows = [
        ["TSLA", "07-16 amc"],
        ["NFLX", "07-17 amc"],
        ["TSM", "07-17 bmo"],
        ["GS", "07-18 bmo"],
        ["UNH", "07-18 bmo"],
        ["AXP", "07-19 bmo"],
      ];
      const ul = document.createElement("ul");
      ul.innerHTML = rows
        .map(
          ([s, d]) =>
            `<li class="flex items-center justify-between gap-2 px-2 py-1 border-b border-zinc-800/50 text-[11px]">` +
            `<span class="font-mono font-bold text-white">${s}</span>` +
            `<span class="text-[10px] text-zinc-500 font-mono shrink-0">${d}</span></li>`
        )
        .join("");
      loadingP.replaceWith(ul);
    }

    // Status bar: force a live-looking strip (health API can be cold locally)
    document.querySelectorAll("span").forEach((el) => {
      const t = (el.textContent || "").trim();
      if (t === "Starting" || t === "Ingesting") {
        el.textContent = "Live feed";
        const dot = el.previousElementSibling || el.querySelector?.(".rounded-full");
        const parent = el.parentElement;
        const pulse = parent?.querySelector(".rounded-full");
        if (pulse) {
          pulse.classList.remove("bg-zinc-600", "bg-amber-400");
          pulse.classList.add("bg-emerald-400", "animate-pulse");
        }
      }
      if (/^Updated\s*[—\-–]?$/.test(t) || t === "Updated —" || t === "Updated -") {
        el.textContent = "Updated 12s ago";
      }
      if (/^Updated\s+[—\-–]$/.test(t)) el.textContent = "Updated 12s ago";
      if (t === "0 catalysts") el.textContent = "10 catalysts";
      if (/^Wire\s*~\s*0s$/i.test(t) || t === "Wire -3s") el.textContent = "Wire ~3s";
    });
    // Catch "Updated —" when clock icon + text are split oddly
    document.querySelectorAll("span").forEach((el) => {
      const t = (el.textContent || "").trim();
      if (t.startsWith("Updated") && (t.includes("—") || t.endsWith("-") || t === "Updated")) {
        el.textContent = "Updated 12s ago";
      }
    });

    // Catches board empty state → seeded proof rows
    const catchesEmpty = Array.from(document.querySelectorAll("p")).find((p) =>
      (p.textContent || "").includes("Speed catches and top callers")
    );
    if (catchesEmpty) {
      const host =
        catchesEmpty.closest('[data-guide="catches-board"]') ||
        catchesEmpty.parentElement;
      if (host) {
        host.innerHTML =
          `<div class="rounded-lg border border-emerald-500/20 bg-emerald-500/5 overflow-hidden">` +
          `<div class="flex items-center gap-2 px-3 py-2 border-b border-emerald-500/15 bg-emerald-500/10">` +
          `<span class="text-[11px] font-semibold text-emerald-200">Catches board</span>` +
          `<span class="ml-auto text-[9px] text-emerald-500">Full proof →</span></div>` +
          `<div class="divide-y divide-emerald-500/10">` +
          [
            ["MRNA", "2s", "+16.9%"],
            ["BJDX", "4s", "+33.5%"],
            ["AMD", "3s", "+5.8%"],
            ["SMCI", "5s", "+11.3%"],
          ]
            .map(
              ([s, d, c]) =>
                `<div class="px-3 py-1.5 text-[11px] flex items-center gap-2">` +
                `<span class="font-mono font-bold text-white w-12">${s}</span>` +
                `<span class="text-zinc-500 font-mono text-[10px] w-10">${d}</span>` +
                `<span class="font-mono text-[10px] w-14 text-emerald-400">${c}</span>` +
                `<span class="text-zinc-600 text-[10px] truncate flex-1">Wire catch</span></div>`
            )
            .join("") +
          `</div></div>`;
      }
    }
  });
  await page.waitForTimeout(300);

  // 1. Full desk
  await shot(page, "desk-full");

  // 2. Wire alerts / market monitor highlighted
  const wireOk =
    (await highlightPanelByTitle(page, "Wire Alerts")) ||
    (await highlightSelector(page, '[data-guide="market-monitor"]'));
  if (!wireOk) console.warn("wire highlight failed");
  await shot(page, "desk-wire");

  // 3. News feed (LiveScanner)
  await highlightSelector(page, '[data-guide="news-feed"]');
  await shot(page, "desk-feed");

  // 4. Volume leaders
  const volOk = await highlightPanelByTitle(page, "Heavy Volume");
  if (!volOk) console.warn("volume highlight failed");
  await shot(page, "desk-volume");

  // 5. Wide clean shot, feed scrolled slightly for variety
  await clearHighlight(page);
  await page.evaluate(() => {
    const feed = document.querySelector('[data-guide="news-feed"]');
    const scroller = feed?.querySelector("[class*='overflow-y']");
    if (scroller) scroller.scrollTop = 120;
  });
  await page.waitForTimeout(400);
  await shot(page, "desk-wide");

  // 6. Advanced: open judgment tools panels
  const extrasBtn = page.getByRole("button", { name: /judgment tools/i }).first();
  if ((await extrasBtn.count()) > 0) {
    await extrasBtn.click().catch(() => {});
    await page.waitForTimeout(1800);
    await page.evaluate(() => {
      document
        .querySelector('[data-guide="daily-edge"]')
        ?.scrollIntoView({ block: "start" });
    });
    await page.waitForTimeout(600);
  }

  // Seed Watchlist Autopsy so Focus tools never show "Loading autopsy…"
  await page.evaluate(() => {
    const loading = Array.from(document.querySelectorAll("p, span")).find((n) =>
      (n.textContent || "").includes("Loading autopsy")
    );
    if (!loading) return;
    const panel =
      loading.closest(".rounded-lg.border") ||
      loading.closest('[class*="border-cyan"]') ||
      loading.parentElement?.parentElement;
    if (!panel) return;
    const rows = [
      ["RIVN", "Offering flagged mid-tape", "-8.4%", "Avoid chase"],
      ["BJDX", "510(k) clearance spike", "+33.5%", "Size for spread"],
      ["MRNA", "Fast track + trial beat", "+16.9%", "Hold plan beat entry"],
      ["GCTK", "Partnership + thin float", "+18.2%", "Took half early"],
    ];
    panel.innerHTML =
      `<div class="flex items-center gap-2 px-3 py-2 border-b border-cyan-500/20 bg-cyan-500/10">` +
      `<span class="text-[11px] font-semibold text-cyan-200">Watchlist Autopsy</span>` +
      `<span class="text-[9px] text-cyan-600 truncate">4 lessons from today</span></div>` +
      `<div class="max-h-44 overflow-y-auto divide-y divide-cyan-500/10">` +
      rows
        .map(
          ([s, h, c, lesson]) =>
            `<div class="px-3 py-1.5">` +
            `<div class="flex items-center gap-2 text-[11px]">` +
            `<span class="font-mono font-bold text-white">${s}</span>` +
            `<span class="font-mono text-[10px] ${String(c).startsWith("-") ? "text-red-400" : "text-emerald-400"}">${c}</span>` +
            `<span class="text-zinc-500 text-[10px] truncate flex-1">${h}</span></div>` +
            `<p class="text-[10px] text-cyan-600/90 mt-0.5 pl-0">${lesson}</p></div>`
        )
        .join("") +
      `</div>`;
  });
  await page.waitForTimeout(300);
  await shot(page, "desk-advanced");

  await browser.close();
  console.log("All desk shots in", SHOTS);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
