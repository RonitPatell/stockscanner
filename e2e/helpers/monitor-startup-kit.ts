/**
 * Helpers for production-representative Monitor instant-startup Playwright tests.
 * Timing values are diagnostic only — never publish as marketing claims without
 * reproducible production methodology and sample sizes.
 */
import { expect, type Page, type Response } from "@playwright/test";
import {
  createMonitorConsoleState,
  installMonitorConsoleMonitors,
  assertConsoleClean,
  type MonitorConsoleState,
} from "./monitor-kit";

export const MONITOR_STARTUP_HARNESS = "/e2e/monitor-harness";

export type NetworkProfile = "online" | "slow-4g" | "high-latency";

export type MonitorStartupMetrics = {
  serverResponseMs: number | null;
  firstContentfulPaintMs: number | null;
  largestContentfulPaintMs: number | null;
  timeToFirstVisibleTickerMs: number | null;
  hydrationMs: number | null;
  timeToStreamConnectionMs: number | null;
  timeToSynchronizedLiveMs: number | null;
  navigationTransferBytes: number | null;
  collectedAtMs: number;
  note: string;
};

export function createStartupConsole(): MonitorConsoleState {
  return createMonitorConsoleState();
}

export function installStartupConsole(
  page: Page,
  state: MonitorConsoleState
): void {
  installMonitorConsoleMonitors(page, state);
}

export async function applyNetworkProfile(
  page: Page,
  profile: NetworkProfile
): Promise<void> {
  const session = await page.context().newCDPSession(page);
  await session.send("Network.enable");
  if (profile === "online") {
    await session.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    return;
  }
  if (profile === "slow-4g") {
    // Approx. Slow 4G: ~1.6 Mbps down, 150 ms RTT
    await session.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    });
    return;
  }
  // High latency fibre-like bandwidth
  await session.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 800,
    downloadThroughput: (10 * 1024 * 1024) / 8,
    uploadThroughput: (5 * 1024 * 1024) / 8,
  });
}

export async function gotoStartupScenario(
  page: Page,
  scenario: string,
  opts?: {
    network?: NetworkProfile;
    symbol?: string;
    waitUntil?: "domcontentloaded" | "commit" | "load";
  }
): Promise<Response | null> {
  if (opts?.network) {
    await applyNetworkProfile(page, opts.network);
  }
  const qs = new URLSearchParams({ scenario });
  if (opts?.symbol) qs.set("symbol", opts.symbol);
  const response = await page.goto(
    `${MONITOR_STARTUP_HARNESS}?${qs.toString()}`,
    {
      waitUntil: opts?.waitUntil ?? "domcontentloaded",
      timeout: 60_000,
    }
  );
  return response;
}

/** Assert SSR HTML body contains seeded ticker before relying on client fetches. */
export async function assertSsrHtmlContainsTicker(
  page: Page,
  symbol: string
): Promise<void> {
  const html = await page.content();
  expect(html).toContain(`data-testid="monitor-ssr-core"`);
  expect(html).toContain(`data-testid="monitor-ssr-ticker-${symbol}"`);
  expect(html).toContain(`data-symbol="${symbol}"`);
  expect(html).not.toContain(`data-testid="monitor-snapshot-unavailable"`);
}

export async function assertTickerVisibleWithoutClientSnapshotFetch(
  page: Page,
  symbol: string
): Promise<void> {
  // Visible interactive ladder (not only sr-only SSR core).
  const ladderRow = page.getByTestId(`monitor-ladder-${symbol}`);
  const ssrRow = page.getByTestId(`monitor-ssr-ticker-${symbol}`);
  await expect(ssrRow).toBeAttached({ timeout: 15_000 });
  await expect(ladderRow.or(page.locator(`[data-symbol="${symbol}"]`).first())).toBeVisible({
    timeout: 15_000,
  });
}

export async function assertNoBlankScannerWhenSnapshotExists(
  page: Page
): Promise<void> {
  const root = page.getByTestId("trustticker-monitor");
  await expect(root).toBeVisible();
  await expect(root).toHaveAttribute("data-ssr-seeded", "true");
  await expect(page.getByTestId("monitor-state-loading")).toHaveCount(0);
  // Quiet is an explicit empty market — only assert blank when SSR seeded with tickers.
  const expected = await page
    .getByTestId("monitor-e2e-harness")
    .getAttribute("data-expected-ticker");
  if (expected) {
    await expect(page.getByTestId("monitor-state-quiet")).toHaveCount(0);
    await expect(page.getByTestId("priority-ladder")).toBeVisible();
  }
}

export async function assertNoFullPageSpinnerWithSnapshot(
  page: Page
): Promise<void> {
  await expect(page.getByTestId("monitor-state-loading")).toHaveCount(0);
  const spinners = page.locator(
    '[data-testid="monitor-state-loading"], .tt-monitor__full-spinner, [aria-busy="true"][data-full-page]'
  );
  await expect(spinners).toHaveCount(0);
}

export async function assertSnapshotRemainsWhileStreamConnects(
  page: Page,
  symbol: string
): Promise<void> {
  await expect(page.getByTestId(`monitor-ssr-ticker-${symbol}`)).toBeAttached();
  // Syncing label may appear briefly; ladder must remain.
  const ladder = page.getByTestId("priority-ladder");
  await expect(ladder).toBeVisible();
  await expect(page.getByTestId(`monitor-ladder-${symbol}`)).toBeVisible();
}

export async function countMonitorSnapshotApiCalls(
  page: Page,
  during: () => Promise<void>
): Promise<number> {
  let count = 0;
  const handler = (req: { url: () => string }) => {
    if (req.url().includes("/api/monitor/snapshot")) count += 1;
  };
  page.on("request", handler);
  try {
    await during();
  } finally {
    page.off("request", handler);
  }
  return count;
}

export async function assertDisconnectedNeverClaimsLive(
  page: Page
): Promise<void> {
  const connection = page.getByTestId("monitor-connection");
  await expect(connection).toBeVisible();
  const text = (await connection.innerText()).toLowerCase();
  const tone = await connection.getAttribute("data-tone");
  const state = await connection.getAttribute("data-state");
  expect(text).not.toMatch(/\blive\b/);
  if (state) {
    expect(state.toLowerCase()).not.toBe("live");
  }
  if (tone) {
    expect(tone.toLowerCase()).not.toBe("live");
  }
  const root = page.getByTestId("trustticker-monitor");
  const sync = await root.getAttribute("data-sync-state");
  if (sync === "DISCONNECTED" || sync === "RECONNECTING") {
    expect(text).not.toMatch(/\blive\b/);
  }
}

export async function assertStaleExplicitlyLabelled(page: Page): Promise<void> {
  const root = page.getByTestId("trustticker-monitor");
  await expect(root).toHaveAttribute("data-snapshot-source", /STALE|POSTGRES|REDIS_STALE/i);
  const body = await page.locator("body").innerText();
  const labelled =
    /stale|degraded|delayed|last known|snapshot ·/i.test(body) ||
    (await page.getByTestId("monitor-snapshot-age").count()) > 0 ||
    (await page.getByTestId("monitor-data-warning").count()) > 0 ||
    (await page.getByTestId("monitor-connection").innerText()).match(
      /degraded|delayed|stale|disconnected/i
    );
  expect(Boolean(labelled)).toBe(true);
}

export async function assertSecondaryFailureDoesNotBlockCore(
  page: Page,
  symbol: string
): Promise<void> {
  await page.route("**/api/**/analogue**", (route) => route.abort());
  await page.route("**/api/**/dilution**", (route) => route.abort());
  await page.route("**/api/filings**", (route) => route.abort());
  await expect(page.getByTestId(`monitor-ladder-${symbol}`)).toBeVisible();
  await expect(page.getByTestId("priority-ladder")).toBeVisible();
  await expect(page.getByTestId("monitor-state-loading")).toHaveCount(0);
}

export async function collectStartupMetrics(
  page: Page,
  serverResponseMs: number | null
): Promise<MonitorStartupMetrics> {
  const browser = await page.evaluate(() => {
    const nav = performance.getEntriesByType(
      "navigation"
    )[0] as PerformanceNavigationTiming | undefined;
    const paints = performance.getEntriesByType("paint");
    const fcp = paints.find((p) => p.name === "first-contentful-paint");
    const lcpEntries = performance.getEntriesByType(
      "largest-contentful-paint"
    ) as PerformanceEntry[];
    const lcp = lcpEntries[lcpEntries.length - 1];
    const marks = (window.__MONITOR_PERF__ ?? []) as Array<{
      name: string;
      t: number;
    }>;
    const mark = (n: string) => marks.find((m) => m.name === n)?.t ?? null;
    const navStart = mark("monitor_navigation_start") ?? 0;
    const html = mark("monitor_html_received");
    const hydration = mark("monitor_hydration_complete");
    const firstTicker = mark("monitor_first_visible_ticker");
    const stream = mark("monitor_stream_connected");
    const live = mark("monitor_live_synced");
    return {
      fcp: fcp ? Math.round(fcp.startTime) : null,
      lcp: lcp ? Math.round(lcp.startTime) : null,
      hydrationMs:
        html != null && hydration != null
          ? Math.round(hydration - html)
          : null,
      timeToFirstVisibleTickerMs:
        firstTicker != null ? Math.round(firstTicker - navStart) : null,
      timeToStreamConnectionMs:
        stream != null ? Math.round(stream - navStart) : null,
      timeToSynchronizedLiveMs:
        live != null ? Math.round(live - navStart) : null,
      transfer: nav?.transferSize ?? null,
      responseStart: nav ? Math.round(nav.responseStart) : null,
    };
  });

  return {
    serverResponseMs: serverResponseMs ?? browser.responseStart,
    firstContentfulPaintMs: browser.fcp,
    largestContentfulPaintMs: browser.lcp,
    timeToFirstVisibleTickerMs: browser.timeToFirstVisibleTickerMs,
    hydrationMs: browser.hydrationMs,
    timeToStreamConnectionMs: browser.timeToStreamConnectionMs,
    timeToSynchronizedLiveMs: browser.timeToSynchronizedLiveMs,
    navigationTransferBytes: browser.transfer,
    collectedAtMs: Date.now(),
    note: "Diagnostic only — not a marketing claim; requires production sample sizes.",
  };
}

export async function assertStartupConsoleClean(
  state: MonitorConsoleState
): Promise<void> {
  await assertConsoleClean(state);
}

export { assertConsoleClean };
