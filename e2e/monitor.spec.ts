import { expect, test } from "@playwright/test";
import {
  MONITOR_GUIDE_TARGETS,
} from "../src/lib/monitor/guide-targets.ts";
import {
  MONITOR_VIEWPORTS,
  assertColourNotOnly,
  assertConsoleClean,
  assertGuideTargets,
  assertNoBannedCopy,
  assertNoHorizontalOverflow,
  assertNoNestedPageScrollTrap,
  captureMonitorScreenshot,
  createMonitorConsoleState,
  desktopMonitor,
  gotoMonitorScenario,
  installMonitorConsoleMonitors,
  isMobileProject,
  visibleIntel,
  visibleTestId,
} from "./helpers/monitor-kit";

/**
 * TrustTicker Monitor E2E — deterministic seeded / replayed harness.
 * Path: /e2e/monitor-harness?scenario=…
 * Requires local dev or ALLOW_E2E_HARNESS=1 (see playwright webServer).
 */

test.describe.configure({ mode: "serial" });

test.describe("Monitor journeys (seeded harness)", () => {
  test("1 · Market opens quietly — understandable empty, no false urgency", async ({
    page,
  }) => {
    const cons = createMonitorConsoleState();
    installMonitorConsoleMonitors(page, cons);
    await gotoMonitorScenario(page, "quiet");

    await expect(visibleTestId(page, "monitor-state-quiet")).toBeVisible();
    await expect(visibleTestId(page, "monitor-state-quiet")).toContainText(
      /Quiet market|does not invent|artificial/i
    );
    await expect(page.getByTestId("monitor-connection")).toContainText(/Empty/i);
    // No critical urgency ladder rows
    await expect(page.getByTestId("priority-ladder")).toHaveCount(0);
    await assertNoBannedCopy(page);
    await assertColourNotOnly(page);
    await assertNoHorizontalOverflow(page);
    await assertConsoleClean(cons);
  });

  test("2 · Momentum emerges — outer ring, EMERGING, ladder keeps focus", async ({
    page,
  }, testInfo) => {
    test.skip(isMobileProject(testInfo.project.name), "Spatial field is desktop/tablet");
    const cons = createMonitorConsoleState();
    installMonitorConsoleMonitors(page, cons);
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoMonitorScenario(page, "emerging");

    await expect(
      visibleTestId(page, "monitor-intel-momentum-state")
    ).toContainText(/EMERGING/i);
    const node = page.getByTestId("monitor-node-EEEE");
    await expect(node).toBeVisible();
    await expect(node).toHaveAttribute("data-ring", "outer");

    const ladderRow = desktopMonitor(page).getByTestId("monitor-ladder-EEEE");
    await ladderRow.focus();
    await expect(ladderRow).toBeFocused();
    await page.keyboard.press("ArrowDown");
    // Focus remains inside ladder (LLLL or still EEEE)
    const active = await page.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.getAttribute("data-testid")
    );
    expect(active).toMatch(/monitor-ladder-/);
    await assertNoBannedCopy(page);
    await assertConsoleClean(cons);
  });

  test("3 · New verified catalyst — priority, source, timestamps", async ({
    page,
  }) => {
    const cons = createMonitorConsoleState();
    installMonitorConsoleMonitors(page, cons);
    await gotoMonitorScenario(page, "catalyst");

    const intel = visibleIntel(page);
    await expect(intel).toBeVisible();
    await expect(intel.getByTestId("monitor-intel-attention")).toContainText(/82|8/);
    await expect(intel.getByTestId("monitor-intel-source-name")).toBeVisible();
    await expect(intel.getByTestId("monitor-intel-published-at")).toBeVisible();
    await expect(intel.getByTestId("monitor-intel-first-seen")).toBeVisible();
    await expect(intel.getByTestId("monitor-intel-source")).toBeVisible();
    const srcText = await intel.getByTestId("monitor-intel-source-name").innerText();
    expect(srcText.length).toBeGreaterThan(3);
    await assertNoBannedCopy(page);
    await assertConsoleClean(cons);
  });

  test("4 · Ticker becomes leader — centre, transition recorded, squawk once", async ({
    page,
  }, testInfo) => {
    test.skip(isMobileProject(testInfo.project.name), "Spatial field is desktop/tablet");
    const cons = createMonitorConsoleState();
    installMonitorConsoleMonitors(page, cons);
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoMonitorScenario(page, "leader");

    await expect(page.getByTestId("monitor-global-leader")).toContainText("AAAA");
    const leaderNode = page.getByTestId("monitor-node-AAAA");
    await expect(leaderNode).toBeVisible();
    await expect(leaderNode).toHaveAttribute("data-ring", "centre");

    await expect(
      visibleTestId(page, "monitor-intel-timeline")
    ).toContainText(/BBBB → AAAA|Leader transition/i);

    // Squawk fires once on leader change from seeded previousLeader
    await expect
      .poll(async () => Number(await page.getByTestId("monitor-squawk-fire-count").innerText()))
      .toBeGreaterThanOrEqual(1);
    const fires = Number(await page.getByTestId("monitor-squawk-fire-count").innerText());
    // StrictMode may double-invoke in dev — require at least one, at most two
    expect(fires).toBeGreaterThanOrEqual(1);
    expect(fires).toBeLessThanOrEqual(2);

    await page.getByTestId("monitor-squawk-menu").click();
    await expect(page.getByTestId("monitor-squawk-bar")).toBeVisible();
    await assertConsoleClean(cons);
  });

  test("5 · User pins another ticker — auto-select stops, global leader separate", async ({
    page,
  }) => {
    const cons = createMonitorConsoleState();
    installMonitorConsoleMonitors(page, cons);
    await gotoMonitorScenario(page, "pinned");

    await expect(page.getByTestId("monitor-pinned-symbol")).toContainText("CCCC");
    await expect(page.getByTestId("monitor-global-leader")).toContainText("AAAA");
    await expect(visibleIntel(page)).toContainText("CCCC");
    // Pin and leader are distinct
    const pin = await page.getByTestId("monitor-pinned-symbol").innerText();
    const lead = await page.getByTestId("monitor-global-leader").innerText();
    expect(pin).toContain("CCCC");
    expect(lead).toContain("AAAA");
    expect(pin).not.toEqual(lead);
    await assertConsoleClean(cons);
  });

  test("6 · Spread deteriorates — tradeability warn, no buy/sell instruction", async ({
    page,
  }) => {
    const cons = createMonitorConsoleState();
    installMonitorConsoleMonitors(page, cons);
    await gotoMonitorScenario(page, "spread");

    const trade = visibleTestId(page, "monitor-intel-tradeability");
    await expect(trade).toContainText(/thin|spread|deteriorat/i);
    await expect(trade).toHaveAttribute("data-warn", "true");
    // Amber/warn is paired with text (not colour-only)
    await expect(trade).toContainText(/Extremely thin|spread/i);

    const intel = await visibleIntel(page).innerText();
    expect(intel).not.toMatch(/\bbuy now\b|\bsell now\b|\bplace a (buy|sell)\b/i);
    await assertNoBannedCopy(page);
    await assertConsoleClean(cons);
  });

  test("7 · Halt and resumption — halt overrides, no invented resume time", async ({
    page,
  }, testInfo) => {
    test.skip(isMobileProject(testInfo.project.name), "Spatial field is desktop/tablet");
    const cons = createMonitorConsoleState();
    installMonitorConsoleMonitors(page, cons);
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoMonitorScenario(page, "halt");

    await expect(visibleTestId(page, "monitor-intel-momentum-state")).toContainText(
      /HALTED/i
    );
    await expect(visibleTestId(page, "monitor-intel-risks")).toContainText(/Halt/i);
    await expect(page.getByTestId("monitor-node-FFFF")).toHaveAttribute(
      "data-ring",
      "halt"
    );

    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(
      /resumes? at \d|resume time:|will resume in \d+ minutes/i
    );
    await assertNoBannedCopy(page);
    await assertConsoleClean(cons);
  });

  test("8 · Provider outage then recovery — degraded/stale then live", async ({
    page,
  }) => {
    const cons = createMonitorConsoleState();
    installMonitorConsoleMonitors(page, cons);
    await gotoMonitorScenario(page, "outage");

    await expect(page.getByTestId("monitor-connection")).toContainText(/Degraded/i);
    await expect(page.getByTestId("monitor-data-warning")).toBeVisible();
    await expect(visibleTestId(page, "monitor-intel-data-confidence")).toBeVisible();
    const conf = await visibleTestId(page, "monitor-intel-data-confidence").innerText();
    expect(conf).toMatch(/Low|Reduced|stale|degraded/i);

    // Deterministic recovery via seeded navigation (harness header can occlude links)
    await gotoMonitorScenario(page, "recovered");
    await expect(page.getByTestId("trustticker-monitor")).toHaveAttribute(
      "data-e2e-scenario",
      "recovered"
    );
    await expect(page.getByTestId("monitor-connection")).toContainText(/Live/i);
    await assertConsoleClean(cons);
  });

  test("9 · User isolation — private APIs deny; client userId ignored", async ({
    request,
    page,
  }) => {
    // Unauthenticated private surfaces
    const strategies = await request.get("/api/alert-strategies");
    expect([401, 403]).toContain(strategies.status());

    const settings = await request.get("/api/settings");
    expect([401, 403]).toContain(settings.status());

    const stream = await request.get("/api/monitor/stream");
    expect([401, 403]).toContain(stream.status());

    const ack = await request.post("/api/monitor/ack", {
      data: { sequence: 1, userId: "user-b-attacker" },
    });
    expect([401, 403]).toContain(ack.status());

    // Preset panel on harness is local — export must not embed foreign userId ownership
    await gotoMonitorScenario(page, "emerging");
    await page.getByTestId("monitor-active-preset").click();
    await expect(page.getByTestId("monitor-preset-panel")).toBeVisible();
    const html = await page.getByTestId("monitor-preset-panel").innerHTML();
    expect(html).not.toMatch(/userId|passwordHash/i);
  });

  test("10 · Mobile fallback — ranked cards + detail sheet", async ({ page }) => {
    const cons = createMonitorConsoleState();
    installMonitorConsoleMonitors(page, cons);
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoMonitorScenario(page, "catalyst");

    await expect(page.getByTestId("monitor-mobile-BBBB")).toBeVisible();
    // Spatial field not visible on mobile (may still exist in hidden desktop tree)
    await expect(page.getByTestId("momentum-field-svg")).not.toBeVisible();

    const sheet = page.getByTestId("monitor-mobile-sheet");
    const mobile = page.locator(".tt-monitor__mobile");
    // Seed may open the sheet — close then reopen via ranked card.
    if ((await sheet.getAttribute("data-open")) === "true") {
      await sheet.getByRole("button", { name: /Close/i }).click();
      await expect(sheet).toHaveAttribute("data-open", "false");
    }
    await mobile.getByTestId("monitor-mobile-BBBB").evaluate((el) => {
      (el as HTMLButtonElement).click();
    });
    await expect(sheet).toHaveAttribute("data-open", "true", { timeout: 10_000 });
    await expect(mobile.getByTestId("monitor-selected-ticker")).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertConsoleClean(cons);
  });
});

test.describe("Monitor quality gates", () => {
  test("Platform Guide targets unique on live scene", async ({ page }, testInfo) => {
    test.skip(isMobileProject(testInfo.project.name), "Guide spotlights desktop chrome");
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoMonitorScenario(page, "leader");
    await assertGuideTargets(page);
    for (const id of MONITOR_GUIDE_TARGETS) {
      await expect(page.locator(`[data-guide="${id}"]`)).toHaveCount(1);
    }
  });

  test("keyboard-only completion on emerging scene", async ({ page }, testInfo) => {
    test.skip(isMobileProject(testInfo.project.name), "Ladder keyboard path is desktop/tablet");
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoMonitorScenario(page, "emerging");
    await page.getByTestId("monitor-search").focus();
    await page.keyboard.type("EEEE");
    await page.keyboard.press("Tab");
    // Reach ladder and activate
    await desktopMonitor(page).getByTestId("monitor-ladder-EEEE").focus();
    await page.keyboard.press("Enter");
    await expect(visibleIntel(page)).toBeVisible();
    await expect(visibleTestId(page, "monitor-intel-momentum-state")).toContainText(
      /EMERGING/i
    );
  });

  test("screen-reader labels on field and ladder", async ({ page }, testInfo) => {
    test.skip(isMobileProject(testInfo.project.name), "Field SVG is desktop/tablet");
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoMonitorScenario(page, "emerging");
    await expect(page.getByTestId("momentum-field-svg")).toHaveAttribute(
      "aria-label",
      /Momentum field/i
    );
    const nodeLabel = await page
      .getByTestId("monitor-node-EEEE")
      .getAttribute("aria-label");
    expect(nodeLabel).toBeTruthy();
    expect(nodeLabel!.length).toBeGreaterThan(5);
    await expect(
      page.getByLabel(/Attention-ranked tickers/i)
    ).toBeVisible();
  });

  test("reduced-motion mode does not error", async ({ page }) => {
    const cons = createMonitorConsoleState();
    installMonitorConsoleMonitors(page, cons);
    await gotoMonitorScenario(page, "leader", { reducedMotion: true });
    await expect(page.getByTestId("trustticker-monitor")).toBeVisible();
    await assertNoBannedCopy(page);
    await assertNoNestedPageScrollTrap(page);
    await assertConsoleClean(cons);
  });

  test("no hydration / console errors across core scenes", async ({ page }) => {
    const cons = createMonitorConsoleState();
    installMonitorConsoleMonitors(page, cons);
    for (const scene of ["quiet", "emerging", "catalyst", "halt", "outage"]) {
      await gotoMonitorScenario(page, scene);
      await assertNoBannedCopy(page);
      await assertNoHorizontalOverflow(page);
    }
    await assertConsoleClean(cons);
  });
});

test.describe("Monitor visual regression", () => {
  // Capture once per named viewport (desktop project); avoid triplicating across projects.
  for (const vp of MONITOR_VIEWPORTS) {
    test(`quiet @ ${vp.name}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "Viewport matrix runs on desktop project");
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await gotoMonitorScenario(page, "quiet");
      await captureMonitorScreenshot(page, `monitor-quiet-${vp.name}`);
    });

    test(`leader @ ${vp.name}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "Viewport matrix runs on desktop project");
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await gotoMonitorScenario(page, "leader");
      await captureMonitorScreenshot(page, `monitor-leader-${vp.name}`);
    });

    test(`halt @ ${vp.name}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "Viewport matrix runs on desktop project");
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await gotoMonitorScenario(page, "halt");
      await captureMonitorScreenshot(page, `monitor-halt-${vp.name}`);
    });
  }
});
