import { expect, test } from "@playwright/test";
import { MONITOR_VIEWPORTS } from "./helpers/monitor-kit";

/**
 * Visual regression for Monitor design gallery.
 * Route: /design/monitor (ALLOW_E2E_HARNESS=1 or local dev).
 */

test.describe.configure({ mode: "serial" });

test.describe("Monitor design gallery visual regression", () => {
  for (const vp of MONITOR_VIEWPORTS) {
    test(`gallery @ ${vp.name}`, async ({ page }, testInfo) => {
      test.skip(
        testInfo.project.name !== "desktop",
        "Viewport matrix runs on desktop project"
      );
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/design/monitor", { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("monitor-design-gallery")).toBeVisible({
        timeout: 20_000,
      });
      await page.waitForTimeout(200);
      await expect(page.getByTestId("monitor-design-gallery")).toHaveScreenshot(
        `monitor-design-gallery-${vp.name}.png`,
        {
          animations: "disabled",
          maxDiffPixelRatio: 0.04,
        }
      );
    });
  }
});
