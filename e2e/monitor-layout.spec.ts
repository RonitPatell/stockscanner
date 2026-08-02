/**
 * TrustTicker Monitor — command-centre layout guards (no backend).
 */
import { test, expect } from "@playwright/test";
import {
  assertCommandCentreGrid1920,
  assertNoClippedLabels,
  assertNoHorizontalOverflow,
  assertNoOverlappingControls,
  assertReadableMetadata,
  assertScrollBudget,
  createMonitorConsoleState,
  gotoMonitorScenario,
  installMonitorConsoleMonitors,
  isMobileProject,
} from "./helpers/monitor-kit";

test.describe.configure({ mode: "serial" });

test.describe("Monitor command-centre layout", () => {
  test("1920×1080 grid budget + overflow / clip / overlap / scroll / type", async ({
    page,
  }, testInfo) => {
    test.skip(isMobileProject(testInfo.project.name), "Desktop grid");
    const cons = createMonitorConsoleState();
    installMonitorConsoleMonitors(page, cons);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await gotoMonitorScenario(page, "catalyst");

    await assertCommandCentreGrid1920(page);
    await assertNoHorizontalOverflow(page);
    await assertNoClippedLabels(page);
    await assertNoOverlappingControls(page);
    await assertScrollBudget(page);
    await assertReadableMetadata(page);

    await expect(page.getByTestId("monitor-status-bar")).toBeVisible();
    await expect(page.getByTestId("monitor-global-leader")).toBeVisible();
    await expect(page.locator(".tt-monitor__leader-strip")).toBeVisible();
  });

  test("1440 — ladder shrinks before field; no page overflow", async ({
    page,
  }, testInfo) => {
    test.skip(isMobileProject(testInfo.project.name), "Desktop layout");
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoMonitorScenario(page, "leader");

    const widths = await page.evaluate(() => {
      const ladder = document.querySelector(".tt-monitor__ladder-wrap");
      const field = document.querySelector(".tt-monitor__field-wrap");
      return {
        ladder: ladder?.getBoundingClientRect().width ?? 0,
        field: field?.getBoundingClientRect().width ?? 0,
      };
    });
    expect(widths.field).toBeGreaterThan(widths.ladder);
    expect(widths.ladder).toBeLessThanOrEqual(280);
    await assertNoHorizontalOverflow(page);
    await assertNoOverlappingControls(page);
    await assertScrollBudget(page);
  });

  test("1280 — intel drawer + field full width; ladder slide-over", async ({
    page,
  }, testInfo) => {
    test.skip(isMobileProject(testInfo.project.name), "Tablet layout");
    await page.setViewportSize({ width: 1280, height: 720 });
    await gotoMonitorScenario(page, "catalyst");

    const layout = await page.evaluate(() => {
      const body = document.querySelector(".tt-monitor__body");
      const ladder = document.querySelector(".tt-monitor__ladder-wrap");
      const field = document.querySelector(".tt-monitor__field-wrap");
      const intel = document.querySelector(".tt-monitor__intel-wrap");
      if (!body || !ladder || !field || !intel) return null;
      const bst = getComputedStyle(body);
      return {
        cols: bst.gridTemplateColumns,
        fieldW: field.getBoundingClientRect().width,
        bodyW: body.getBoundingClientRect().width,
        ladderPos: getComputedStyle(ladder).position,
        intelPos: getComputedStyle(intel).position,
        intelOpen: intel.getAttribute("data-open"),
      };
    });
    expect(layout).not.toBeNull();
    expect(layout!.ladderPos).toBe("fixed");
    expect(layout!.intelPos).toBe("fixed");
    expect(layout!.fieldW).toBeGreaterThan(layout!.bodyW * 0.85);
    await assertNoHorizontalOverflow(page);
    await assertScrollBudget(page);
  });

  test("mobile — ranked cards, no spatial field scroll surface", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoMonitorScenario(page, "catalyst");
    await expect(page.getByTestId("monitor-mobile-BBBB")).toBeVisible();
    await expect(page.getByTestId("momentum-field-svg")).not.toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertReadableMetadata(page);
  });

  test("connection popover holds infra notes; bar stays lean", async ({
    page,
  }, testInfo) => {
    test.skip(isMobileProject(testInfo.project.name), "Desktop chrome");
    await page.setViewportSize({ width: 1440, height: 900 });
    await gotoMonitorScenario(page, "outage");

    const barText = await page.getByTestId("monitor-status-bar").innerText();
    expect(barText).not.toMatch(/worker cycle|CRON|redis|prisma/i);

    await page.getByTestId("monitor-connection").click();
    await expect(page.getByTestId("monitor-connection-panel")).toBeVisible();
    await expect(page.getByTestId("monitor-connection-panel")).toContainText(
      /Connection detail|Stream state|Degraded/i
    );
  });
});
