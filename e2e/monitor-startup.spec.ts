/**
 * Production-representative Playwright tests for instant Monitor startup.
 *
 * Primary surface: /e2e/monitor-harness?scenario=startup_* (SSR-seeded).
 * Authenticated /dashboard?view=monitor paths run when PLAYWRIGHT_STORAGE_STATE
 * is set (Pro session). Timing metrics are collected for diagnostics only —
 * do not publish as marketing claims without production methodology.
 */
import { expect, test } from "@playwright/test";
import {
  assertDisconnectedNeverClaimsLive,
  assertNoBlankScannerWhenSnapshotExists,
  assertNoFullPageSpinnerWithSnapshot,
  assertSecondaryFailureDoesNotBlockCore,
  assertSnapshotRemainsWhileStreamConnects,
  assertSsrHtmlContainsTicker,
  assertStaleExplicitlyLabelled,
  assertStartupConsoleClean,
  assertTickerVisibleWithoutClientSnapshotFetch,
  collectStartupMetrics,
  countMonitorSnapshotApiCalls,
  createStartupConsole,
  gotoStartupScenario,
  installStartupConsole,
  MONITOR_STARTUP_HARNESS,
} from "./helpers/monitor-startup-kit";
import { MONITOR_ROUTE_HREF } from "../src/lib/monitor/prefetch-gate.ts";

const VP = { width: 1440, height: 900 };
const hasAuth = Boolean(process.env.PLAYWRIGHT_STORAGE_STATE);

test.describe("Monitor instant startup (harness SSR seed)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VP);
  });

  test("cold browser cache — seeded HTML + visible ticker, no blank/spinner", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      // Cold cache / storage
      storageState: undefined,
    });
    const page = await context.newPage();
    await page.context().clearCookies();
    const cons = createStartupConsole();
    installStartupConsole(page, cons);

    const t0 = Date.now();
    const response = await gotoStartupScenario(page, "startup_active");
    const serverResponseMs = Date.now() - t0;

    // Dev Turbopack panics (e.g. CSS encoding) surface as 500 — fail with body hint.
    if (!response?.ok() && response?.status() !== 304) {
      const body = await page.content();
      throw new Error(
        `Harness HTTP ${response?.status() ?? "null"}. Ensure next dev is healthy (ALLOW_E2E_HARNESS / local). Body starts: ${body.slice(0, 280)}`
      );
    }
    await assertSsrHtmlContainsTicker(page, "AAAA");
    await assertTickerVisibleWithoutClientSnapshotFetch(page, "AAAA");
    await assertNoBlankScannerWhenSnapshotExists(page);
    await assertNoFullPageSpinnerWithSnapshot(page);
    await assertSnapshotRemainsWhileStreamConnects(page, "AAAA");

    const metrics = await collectStartupMetrics(page, serverResponseMs);
    // Soft presence checks only — not SLA / marketing gates.
    expect(metrics.note).toMatch(/Diagnostic only/);
    expect(
      metrics.timeToFirstVisibleTickerMs == null ||
        metrics.timeToFirstVisibleTickerMs >= 0
    ).toBe(true);

    await assertStartupConsoleClean(cons);
    await context.close();
  });

  test("warm browser cache — second navigation keeps seeded first paint", async ({
    page,
  }) => {
    const cons = createStartupConsole();
    installStartupConsole(page, cons);

    await gotoStartupScenario(page, "startup_active");
    await assertTickerVisibleWithoutClientSnapshotFetch(page, "AAAA");

    await gotoStartupScenario(page, "startup_active");
    await assertSsrHtmlContainsTicker(page, "AAAA");
    await assertNoBlankScannerWhenSnapshotExists(page);
    await assertNoFullPageSpinnerWithSnapshot(page);
    await assertStartupConsoleClean(cons);
  });

  test("Slow 4G — core ticker still from seeded HTML", async ({ page }) => {
    const cons = createStartupConsole();
    installStartupConsole(page, cons);
    test.setTimeout(90_000);

    await gotoStartupScenario(page, "startup_active", { network: "slow-4g" });
    await assertSsrHtmlContainsTicker(page, "AAAA");
    await assertTickerVisibleWithoutClientSnapshotFetch(page, "AAAA");
    await assertNoBlankScannerWhenSnapshotExists(page);
    await assertStartupConsoleClean(cons);
  });

  test("high latency — no full-page spinner when snapshot exists", async ({
    page,
  }) => {
    const cons = createStartupConsole();
    installStartupConsole(page, cons);
    test.setTimeout(90_000);

    await gotoStartupScenario(page, "startup_active", {
      network: "high-latency",
    });
    await assertNoFullPageSpinnerWithSnapshot(page);
    await assertTickerVisibleWithoutClientSnapshotFetch(page, "AAAA");
    await assertStartupConsoleClean(cons);
  });

  test("no duplicate initial /api/monitor/snapshot on harness seed", async ({
    page,
  }) => {
    const cons = createStartupConsole();
    installStartupConsole(page, cons);

    const count = await countMonitorSnapshotApiCalls(page, async () => {
      await gotoStartupScenario(page, "startup_active");
      await assertTickerVisibleWithoutClientSnapshotFetch(page, "AAAA");
      await page.waitForTimeout(800);
    });
    expect(count).toBe(0);
    await assertStartupConsoleClean(cons);
  });

  test("no hydration mismatch / console errors on active startup", async ({
    page,
  }) => {
    const cons = createStartupConsole();
    installStartupConsole(page, cons);
    await gotoStartupScenario(page, "startup_active");
    await page.waitForTimeout(500);
    expect(cons.hydration).toEqual([]);
    await assertStartupConsoleClean(cons);
  });

  test("stale fallback is explicitly labelled", async ({ page }) => {
    const cons = createStartupConsole();
    installStartupConsole(page, cons);
    await gotoStartupScenario(page, "startup_stale");
    await assertStaleExplicitlyLabelled(page);
    await assertNoFullPageSpinnerWithSnapshot(page);
    await assertStartupConsoleClean(cons);
  });

  test("disconnected / stream-down never claims live", async ({ page }) => {
    const cons = createStartupConsole();
    installStartupConsole(page, cons);
    await gotoStartupScenario(page, "startup_stream_down");
    await assertDisconnectedNeverClaimsLive(page);
    // Snapshot remains visible (last known / seeded).
    await expect(page.getByTestId("monitor-ssr-ticker-AAAA")).toBeAttached();
    await expect(page.getByTestId("monitor-ladder-AAAA")).toBeVisible();
    await assertStartupConsoleClean(cons);
  });

  test("market closed — seeded content, not blank invent", async ({ page }) => {
    const cons = createStartupConsole();
    installStartupConsole(page, cons);
    await gotoStartupScenario(page, "startup_closed");
    await assertSsrHtmlContainsTicker(page, "AAAA");
    await expect(page.getByTestId("trustticker-monitor")).toHaveAttribute(
      "data-snapshot-source",
      /STALE|REDIS/
    );
    await assertNoBlankScannerWhenSnapshotExists(page);
    await assertStartupConsoleClean(cons);
  });

  test("quiet market — explicit quiet state, no artificial fill", async ({
    page,
  }) => {
    const cons = createStartupConsole();
    installStartupConsole(page, cons);
    await gotoStartupScenario(page, "startup_quiet");
    const quiet = page.getByTestId("monitor-state-quiet").first();
    await expect(quiet).toBeVisible();
    await expect(quiet).toContainText(/does not invent|artificial/i);
    await expect(page.getByTestId("priority-ladder")).toHaveCount(0);
    await assertStartupConsoleClean(cons);
  });

  test("active market-open burst — multiple seeded leaders visible", async ({
    page,
  }) => {
    const cons = createStartupConsole();
    installStartupConsole(page, cons);
    await gotoStartupScenario(page, "startup_burst");
    await assertSsrHtmlContainsTicker(page, "BUR1");
    await expect(page.getByTestId("monitor-ladder-BUR1")).toBeVisible();
    await expect(page.getByTestId("monitor-ladder-BUR2")).toBeVisible();
    await assertNoFullPageSpinnerWithSnapshot(page);
    await assertStartupConsoleClean(cons);
  });

  test("secondary panel failure does not block core Monitor", async ({
    page,
  }) => {
    const cons = createStartupConsole();
    installStartupConsole(page, cons);
    await gotoStartupScenario(page, "startup_active");
    await assertSecondaryFailureDoesNotBlockCore(page, "AAAA");
    await assertStartupConsoleClean(cons);
  });

  test("stream abort during hydration — snapshot stays visible", async ({
    page,
  }) => {
    const cons = createStartupConsole();
    installStartupConsole(page, cons);
    await page.route("**/api/monitor/stream**", (route) => route.abort());
    await gotoStartupScenario(page, "startup_active");
    await assertSsrHtmlContainsTicker(page, "AAAA");
    await assertTickerVisibleWithoutClientSnapshotFetch(page, "AAAA");
    await assertNoBlankScannerWhenSnapshotExists(page);
    // Stream down must not invent a live claim via connection pill if disconnected.
    await page.waitForTimeout(300);
    await assertStartupConsoleClean(cons);
  });

  test("deep link symbol on harness query remains usable", async ({ page }) => {
    const cons = createStartupConsole();
    installStartupConsole(page, cons);
    await page.goto(
      `${MONITOR_STARTUP_HARNESS}?scenario=startup_active&symbol=BBBB`,
      { waitUntil: "domcontentloaded" }
    );
    await assertSsrHtmlContainsTicker(page, "AAAA");
    await expect(page.getByTestId("monitor-ladder-BBBB")).toBeVisible();
    await assertStartupConsoleClean(cons);
  });

  test("collect startup timing metrics (diagnostic artifact)", async ({
    page,
  }, testInfo) => {
    const t0 = Date.now();
    await gotoStartupScenario(page, "startup_active");
    await assertTickerVisibleWithoutClientSnapshotFetch(page, "AAAA");
    await page.waitForTimeout(400);
    const metrics = await collectStartupMetrics(page, Date.now() - t0);
    await testInfo.attach("monitor-startup-metrics.json", {
      body: JSON.stringify(metrics, null, 2),
      contentType: "application/json",
    });
    expect(metrics.serverResponseMs == null || metrics.serverResponseMs > 0).toBe(
      true
    );
  });
});

test.describe("Monitor instant startup (authenticated dashboard)", () => {
  test.skip(!hasAuth, "Set PLAYWRIGHT_STORAGE_STATE to a Pro session file");

  test.use({
    storageState: process.env.PLAYWRIGHT_STORAGE_STATE,
  });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VP);
  });

  test("authenticated first navigation — snapshot HTML when Redis healthy", async ({
    page,
  }) => {
    const cons = createStartupConsole();
    installStartupConsole(page, cons);

    const response = await page.goto(MONITOR_ROUTE_HREF, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    expect(response?.ok()).toBeTruthy();

    const html = await page.content();
    // Successful Pro request should embed SSR core or explicit unavailable — never silent blank.
    const hasSeed =
      html.includes('data-testid="monitor-ssr-core"') ||
      html.includes('data-testid="monitor-snapshot-unavailable"') ||
      html.includes('data-testid="trustticker-monitor"');
    expect(hasSeed).toBe(true);

    if (html.includes('data-ssr-seeded="true"')) {
      await assertNoFullPageSpinnerWithSnapshot(page);
      const root = page.getByTestId("trustticker-monitor");
      await expect(root).toHaveAttribute("data-ssr-seeded", "true");
    }
    await assertStartupConsoleClean(cons);
  });

  test("navigation from another dashboard page", async ({ page }) => {
    const cons = createStartupConsole();
    installStartupConsole(page, cons);
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await page.goto(MONITOR_ROUTE_HREF, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("trustticker-monitor").or(page.getByTestId("monitor-root"))).toBeVisible({
      timeout: 20_000,
    });
    await assertStartupConsoleClean(cons);
  });

  test("direct deep link with symbol", async ({ page }) => {
    const cons = createStartupConsole();
    installStartupConsole(page, cons);
    await page.goto(`${MONITOR_ROUTE_HREF}&symbol=AAAA`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByTestId("trustticker-monitor").or(page.getByTestId("monitor-root"))
    ).toBeVisible({ timeout: 20_000 });
    await assertStartupConsoleClean(cons);
  });
});
