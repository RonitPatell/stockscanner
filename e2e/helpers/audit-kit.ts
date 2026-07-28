/**
 * Shared helpers for Shell V3 + Feed V3 + Focus V2 workflow audit.
 */
import fs from "node:fs";
import path from "node:path";
import type { Page, ConsoleMessage, Request } from "@playwright/test";
import {
  buildDilutionSeed,
  buildFeedbackLocalSeed,
  buildWorkflowCatalysts,
  WORKFLOW_STATUS_SEED,
} from "../fixtures/workflow-seed";
import { PLATFORM_GUIDE_VERSION } from "../../src/lib/platform-guide.ts";

export const HARNESS_PATH = "/e2e/workflow-harness";
export const REPORT_DIR = path.join(process.cwd(), "e2e", "reports");
export const SCREENSHOT_DIR = path.join(REPORT_DIR, "screenshots");

export type AuditFinding = {
  id: string;
  severity: "P0" | "P1" | "P2" | "pass";
  area: string;
  title: string;
  detail: string;
};

export type AuditState = {
  findings: AuditFinding[];
  consoleErrors: string[];
  failedRequests: string[];
  hydrationWarnings: string[];
  duplicateKeyWarnings: string[];
  screenshots: string[];
};

export function createAuditState(): AuditState {
  return {
    findings: [],
    consoleErrors: [],
    failedRequests: [],
    hydrationWarnings: [],
    duplicateKeyWarnings: [],
    screenshots: [],
  };
}

export function record(
  state: AuditState,
  finding: AuditFinding
): void {
  state.findings.push(finding);
}

export async function installAuditMonitors(
  page: Page,
  state: AuditState
): Promise<void> {
  page.on("console", (msg: ConsoleMessage) => {
    const text = msg.text();
    const type = msg.type();
    // Ignore browser-extension noise
    if (/chrome-extension:|injectScriptAdjust/i.test(text)) return;
    if (type === "error") {
      // Expected in unauthenticated harness / aborted SSE
      if (/net::ERR_FAILED|net::ERR_ABORTED|401 \(Unauthorized\)|Failed to load resource/i.test(text)) {
        return;
      }
      state.consoleErrors.push(text);
    }
    if (/hydration|Hydration|didn'?t match the client/i.test(text)) {
      // Playwright Chromium sometimes injects caret-color on inputs — track separately
      if (/caret-color/i.test(text)) {
        return;
      }
      state.hydrationWarnings.push(text);
    }
    if (/Encountered two children with the same key|Warning: Each child in a list/i.test(text)) {
      state.duplicateKeyWarnings.push(text);
    }
  });

  page.on("pageerror", (err) => {
    const text = String(err);
    if (/chrome-extension:|injectScriptAdjust/i.test(text)) return;
    state.consoleErrors.push(text);
  });

  page.on("requestfailed", (req: Request) => {
    const url = req.url();
    // Ignore aborted SSE / quote streams / analytics noise
    if (/catalysts\/stream|quotes\/stream|vercel\.|analytics|ingest/i.test(url)) return;
    state.failedRequests.push(`${req.failure()?.errorText ?? "fail"} ${url}`);
  });

  page.on("response", (res) => {
    const url = res.url();
    if (!url.includes("/api/")) return;
    if (/catalysts\/stream/i.test(url)) return;
    if (res.status() >= 500) {
      state.failedRequests.push(`${res.status()} ${url}`);
    }
  });
}

export async function mockWorkflowApis(page: Page): Promise<{
  watchlist: string[];
}> {
  const catalysts = buildWorkflowCatalysts();
  const dilution = buildDilutionSeed();
  const watchlist: string[] = [];

  await page.route("**/api/feed**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: catalysts, meta: { seeded: true } }),
    });
  });

  await page.route("**/api/catalysts?**", async (route) => {
    if (route.request().url().includes("/stream")) {
      await route.abort();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(catalysts),
    });
  });

  await page.route("**/api/catalysts/stream**", async (route) => {
    await route.abort();
  });

  await page.route("**/api/dilution**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(dilution),
    });
  });

  await page.route("**/api/status**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(WORKFLOW_STATUS_SEED),
    });
  });

  await page.route("**/api/onboarding**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ showWizard: false, showChecklist: false }),
    });
  });

  await page.route("**/api/alert-strategies**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ strategies: [] }),
    });
  });

  await page.route("**/api/settings**", async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          watchlist,
          subscriptionStatus: "active",
          scannerFilters: null,
        }),
      });
      return;
    }
    if (method === "PATCH" || method === "POST") {
      try {
        const body = route.request().postDataJSON() as {
          watchlist?: string[];
        };
        if (Array.isArray(body?.watchlist)) {
          watchlist.splice(0, watchlist.length, ...body.watchlist);
        }
      } catch {
        /* ignore */
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, watchlist }),
      });
      return;
    }
    await route.fulfill({ status: 200, body: "{}" });
  });

  await page.route("**/api/quotes/stream**", async (route) => {
    await route.abort();
  });
  await page.route("**/api/quotes**", async (route) => {
    if (route.request().url().includes("/stream")) {
      await route.abort();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ quotes: [] }),
    });
  });

  await page.route("**/api/trader-feedback**", async (route) => {
    const method = route.request().method();
    if (method === "DELETE") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, deleted: true }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  return { watchlist };
}

export async function seedBrowserState(page: Page): Promise<void> {
  const feedback = buildFeedbackLocalSeed();
  await page.addInitScript(
    ({ feedbackJson, guideVersion }) => {
      try {
        localStorage.setItem("tt-dashboard-mode", "full");
        localStorage.setItem(`tt-platform-guide-seen-v${guideVersion}`, "1");
        localStorage.setItem("tt-trader-feedback-v1", feedbackJson);
        localStorage.setItem("tt-trader-feedback-sync-opt-in", "0");
        localStorage.setItem("tt-muted-symbols-v1", "[]");
        localStorage.setItem("tt-cookie-notice-dismissed", "1");
      } catch {
        /* ignore */
      }
    },
    {
      feedbackJson: JSON.stringify(feedback),
      guideVersion: PLATFORM_GUIDE_VERSION,
    }
  );
}

export async function openHarness(page: Page): Promise<void> {
  await mockWorkflowApis(page);
  await seedBrowserState(page);
  await page.goto(`${HARNESS_PATH}?view=feed`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.waitForSelector('[data-shell="v3"], [data-testid="e2e-workflow-harness"]', {
    timeout: 60_000,
  });
}

export async function ensureStandardMode(page: Page): Promise<void> {
  const focus = page.getByTestId("focus-mode-v2");
  if (await focus.isVisible().catch(() => false)) {
    const exit = page.getByTestId("exit-focus");
    if (await exit.count()) {
      await exit.click({ force: true, timeout: 5_000 }).catch(() => {});
    }
  }
  const full = page.getByTestId("mode-full");
  if (await full.count()) {
    await full.click({ force: true, timeout: 5_000 }).catch(() => {});
  }
  await page
    .getByTestId("nav-risk")
    .or(page.getByTestId("nav-review"))
    .first()
    .waitFor({ state: "visible", timeout: 15_000 })
    .catch(() => {});
}

export async function shot(
  page: Page,
  state: AuditState,
  name: string
): Promise<void> {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const file = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  state.screenshots.push(path.relative(process.cwd(), file).replace(/\\/g, "/"));
}

export async function checkHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth > doc.clientWidth + 2;
  });
}

export async function checkNestedPageScrollTraps(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const traps: string[] = [];
    const main = document.querySelector('[data-testid="dashboard-main-scroll"]');
    if (!main) return traps;
    const nested = main.querySelectorAll("*");
    nested.forEach((el) => {
      const style = window.getComputedStyle(el);
      const oy = style.overflowY;
      if (
        (oy === "auto" || oy === "scroll") &&
        el.scrollHeight > el.clientHeight + 40 &&
        el.clientHeight > 200
      ) {
        const tag = el.getAttribute("data-testid") || el.getAttribute("data-guide") || el.className?.toString().slice(0, 40);
        // Feed list scroll inside main is expected — flag only full-viewport traps
        if (el.clientHeight > window.innerHeight * 0.85) {
          traps.push(String(tag));
        }
      }
    });
    return traps;
  });
}

export async function assertNoColourOnlyStatus(page: Page): Promise<string[]> {
  // Status dots must sit next to text labels
  return page.evaluate(() => {
    const issues: string[] = [];
    document.querySelectorAll(".tt-status-dot, [class*='status-dot']").forEach((dot) => {
      const parent = dot.parentElement;
      const text = parent?.textContent?.trim() ?? "";
      if (text.length < 2) {
        issues.push("Status indicator without text label");
      }
    });
    return issues;
  });
}

export function writeMarkdownReport(state: AuditState): string {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const out = path.join(REPORT_DIR, `workflow-audit-${stamp}.md`);
  const latest = path.join(REPORT_DIR, "workflow-audit-latest.md");

  const p0 = state.findings.filter((f) => f.severity === "P0");
  const p1 = state.findings.filter((f) => f.severity === "P1");
  const p2 = state.findings.filter((f) => f.severity === "P2");
  const passes = state.findings.filter((f) => f.severity === "pass");
  const redesignComplete = p0.length === 0;

  const lines: string[] = [];
  lines.push(`# TrustTicker workflow audit — Shell V3 / Feed V3 / Focus V2`);
  lines.push(``);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(``);
  lines.push(`## Verdict`);
  lines.push(``);
  if (redesignComplete) {
    lines.push(`**Redesign may proceed** — no P0 usability or security failures recorded.`);
  } else {
    lines.push(
      `**Redesign NOT complete** — ${p0.length} P0 failure(s) remain. Do not mark the redesign done.`
    );
  }
  lines.push(``);
  lines.push(`| Severity | Count |`);
  lines.push(`|----------|------:|`);
  lines.push(`| P0 | ${p0.length} |`);
  lines.push(`| P1 | ${p1.length} |`);
  lines.push(`| P2 | ${p2.length} |`);
  lines.push(`| Pass | ${passes.length} |`);
  lines.push(``);

  lines.push(`## Five usability questions`);
  lines.push(``);
  lines.push(`| # | Question | Expected answer in UI |`);
  lines.push(`|---|----------|------------------------|`);
  lines.push(
    `| 1 | What should the user look at first? | Connection status + Focus/top feed row (highest priority catalyst). |`
  );
  lines.push(
    `| 2 | What changed recently? | Age label on the row + “Last event” in connection status. |`
  );
  lines.push(
    `| 3 | Why does this event matter? | Headline / verified fact + materiality / reaction in drawer. |`
  );
  lines.push(
    `| 4 | What is the primary risk? | Risk badge on row (≤3 badges) + Primary risks section in Decision Drawer. |`
  );
  lines.push(
    `| 5 | What action inside the application is next? | Source / TradingView / Watchlist (W) / Focus / Risk / Review destinations. |`
  );
  lines.push(``);

  const section = (title: string, items: AuditFinding[]) => {
    lines.push(`## ${title}`);
    lines.push(``);
    if (!items.length) {
      lines.push(`_None._`);
      lines.push(``);
      return;
    }
    for (const f of items) {
      lines.push(`### ${f.id} — ${f.title}`);
      lines.push(``);
      lines.push(`- **Severity:** ${f.severity}`);
      lines.push(`- **Area:** ${f.area}`);
      lines.push(`- **Detail:** ${f.detail}`);
      lines.push(``);
    }
  };

  section("P0 failures", p0);
  section("P1 failures", p1);
  section("P2 notes", p2);
  section("Passes", passes);

  lines.push(`## Administrative quality checks`);
  lines.push(``);
  lines.push(`| Check | Result |`);
  lines.push(`|-------|--------|`);
  lines.push(
    `| Browser console errors | ${state.consoleErrors.length ? `FAIL (${state.consoleErrors.length})` : "PASS"} |`
  );
  lines.push(
    `| Failed internal requests | ${state.failedRequests.length ? `FAIL (${state.failedRequests.length})` : "PASS"} |`
  );
  lines.push(
    `| Hydration warnings | ${state.hydrationWarnings.length ? `FAIL (${state.hydrationWarnings.length})` : "PASS"} |`
  );
  lines.push(
    `| Duplicate React keys | ${state.duplicateKeyWarnings.length ? `FAIL (${state.duplicateKeyWarnings.length})` : "PASS"} |`
  );
  lines.push(``);

  if (state.consoleErrors.length) {
    lines.push(`### Console errors`);
    lines.push(``);
    for (const e of state.consoleErrors.slice(0, 20)) {
      lines.push(`- \`${e.replace(/`/g, "'").slice(0, 240)}\``);
    }
    lines.push(``);
  }
  if (state.failedRequests.length) {
    lines.push(`### Failed requests`);
    lines.push(``);
    for (const e of state.failedRequests.slice(0, 20)) {
      lines.push(`- \`${e.replace(/`/g, "'").slice(0, 240)}\``);
    }
    lines.push(``);
  }

  lines.push(`## Screenshots`);
  lines.push(``);
  for (const s of state.screenshots) {
    lines.push(`### ${path.basename(s)}`);
    lines.push(``);
    lines.push(`![${path.basename(s)}](${path.relative(REPORT_DIR, path.join(process.cwd(), s)).replace(/\\/g, "/")})`);
    lines.push(``);
  }

  lines.push(`## Redesign gate`);
  lines.push(``);
  lines.push(
    redesignComplete
      ? `Gate open: no P0 findings.`
      : `Gate closed: resolve all P0 findings before calling the redesign complete.`
  );
  lines.push(``);

  const body = lines.join("\n");
  fs.writeFileSync(out, body, "utf8");
  fs.writeFileSync(latest, body, "utf8");
  return latest;
}
