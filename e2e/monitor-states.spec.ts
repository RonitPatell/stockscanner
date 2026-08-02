import { expect, test } from "@playwright/test";
import {
  assertConsoleClean,
  assertMonitorStateA11y,
  assertNoBannedCopy,
  captureMonitorScreenshot,
  createMonitorConsoleState,
  gotoMonitorScenario,
  installMonitorConsoleMonitors,
  visibleTestId,
} from "./helpers/monitor-kit";

/**
 * Non-ideal Monitor states — visual regression + accessibility.
 * Path: /e2e/monitor-harness?scenario=…
 */

test.describe.configure({ mode: "serial" });

const STATE_VP = { width: 1440, height: 900 };

test.describe("Monitor non-ideal states", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(STATE_VP);
  });

  test("loading — skeleton, systems connecting, no fake tickers", async ({
    page,
  }) => {
    const cons = createMonitorConsoleState();
    installMonitorConsoleMonitors(page, cons);
    await gotoMonitorScenario(page, "loading");
    await assertMonitorStateA11y(page, {
      testId: "monitor-state-loading",
      role: "status",
      heading: /Connecting Monitor/i,
    });
    await expect(visibleTestId(page, "monitor-state-loading")).toContainText(
      /Priority ladder|Momentum field|Connecting/i
    );
    await expect(page.getByTestId("priority-ladder")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(/\$\d+\.\d{2}/);
    await assertNoBannedCopy(page);
    await captureMonitorScreenshot(page, "monitor-state-loading-1440");
    await assertConsoleClean(cons);
  });

  test("quiet market — no artificial fill", async ({ page }) => {
    const cons = createMonitorConsoleState();
    installMonitorConsoleMonitors(page, cons);
    await gotoMonitorScenario(page, "quiet");
    await assertMonitorStateA11y(page, {
      testId: "monitor-state-quiet",
      role: "status",
      heading: /Quiet market/i,
      actionTestId: "monitor-empty-show-all",
    });
    await expect(visibleTestId(page, "monitor-state-quiet")).toContainText(
      /does not invent|artificial candidates/i
    );
    await captureMonitorScreenshot(page, "monitor-state-quiet-1440");
    await assertConsoleClean(cons);
  });

  test("no matching tickers — CTAs", async ({ page }) => {
    const cons = createMonitorConsoleState();
    installMonitorConsoleMonitors(page, cons);
    await gotoMonitorScenario(page, "no_match");
    await assertMonitorStateA11y(page, {
      testId: "monitor-state-no-match",
      role: "status",
      heading: /No priority tickers match/i,
      actionTestId: "monitor-empty-show-all",
    });
    await expect(visibleTestId(page, "monitor-empty-change-preset")).toBeVisible();
    await expect(visibleTestId(page, "monitor-empty-watchlist")).toBeVisible();
    await captureMonitorScreenshot(page, "monitor-state-no-match-1440");
    await assertConsoleClean(cons);
  });

  test("provider outage — categories + status link, no hosts", async ({
    page,
  }) => {
    const cons = createMonitorConsoleState();
    installMonitorConsoleMonitors(page, cons);
    await gotoMonitorScenario(page, "outage");
    await expect(visibleTestId(page, "monitor-data-warning")).toBeVisible();
    await expect(visibleTestId(page, "monitor-status-link")).toHaveAttribute(
      "href",
      "/status"
    );
    const warn = await visibleTestId(page, "monitor-data-warning").innerText();
    expect(warn).toMatch(/Affected:/i);
    expect(warn).not.toMatch(/\.internal|amazonaws|api_key|localhost/i);
    await expect(page.getByTestId("monitor-global-leader")).toHaveAttribute(
      "data-stale",
      "true"
    );
    await expect(page.getByTestId("trustticker-monitor")).toHaveAttribute(
      "data-motion",
      "paused"
    );
    await captureMonitorScreenshot(page, "monitor-state-outage-1440");
    await assertConsoleClean(cons);
  });

  test("partial data — unavailable fields marked", async ({ page }) => {
    const cons = createMonitorConsoleState();
    installMonitorConsoleMonitors(page, cons);
    await gotoMonitorScenario(page, "partial_outage");
    await expect(visibleTestId(page, "monitor-partial-examples")).toBeVisible();
    await expect(visibleTestId(page, "monitor-partial-examples")).toContainText(
      /Quote unavailable|Float unavailable|sample too small/i
    );
    await expect(visibleTestId(page, "monitor-intel-data-confidence")).toBeVisible();
    await captureMonitorScreenshot(page, "monitor-state-partial-1440");
    await assertConsoleClean(cons);
  });

  test("disconnected — last known preserved + overlay", async ({ page }) => {
    const cons = createMonitorConsoleState();
    installMonitorConsoleMonitors(page, cons);
    await gotoMonitorScenario(page, "disconnected");
    await assertMonitorStateA11y(page, {
      testId: "monitor-state-disconnected",
      role: "alert",
      heading: /Disconnected/i,
    });
    await expect(visibleTestId(page, "monitor-reconnect-status")).toContainText(
      /reconnect/i
    );
    await expect(page.getByTestId("trustticker-monitor")).toHaveAttribute(
      "data-last-known",
      "true"
    );
    // Last known ticker still present under overlay
    await expect(page.getByTestId("monitor-ladder-AAAA")).toBeAttached();
    await captureMonitorScreenshot(page, "monitor-state-disconnected-1440");
    await assertConsoleClean(cons);
  });

  test("error — retry + diagnostic id, no stack", async ({ page }) => {
    const cons = createMonitorConsoleState();
    installMonitorConsoleMonitors(page, cons);
    await gotoMonitorScenario(page, "error");
    await assertMonitorStateA11y(page, {
      testId: "monitor-state-error",
      role: "alert",
      heading: /could not load/i,
      actionTestId: "monitor-error-retry",
    });
    const id = await visibleTestId(page, "monitor-diagnostic-id").innerText();
    expect(id).toMatch(/^mon_/);
    await captureMonitorScreenshot(page, "monitor-state-error-1440");
    await assertConsoleClean(cons);
  });
});
