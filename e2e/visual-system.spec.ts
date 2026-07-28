import { expect, test } from "@playwright/test";

/**
 * Visual regression for the TrustTicker visual-system gallery.
 * Viewports: 1440, 1024, 768, 390.
 * Requires PLAYWRIGHT_STORAGE_STATE (authenticated /gallery).
 */

const hasAuth = Boolean(process.env.PLAYWRIGHT_STORAGE_STATE);

const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1024", width: 1024, height: 768 },
  { name: "768", width: 768, height: 1024 },
  { name: "390", width: 390, height: 844 },
] as const;

test.describe("Visual system regression", () => {
  test.skip(!hasAuth, "Set PLAYWRIGHT_STORAGE_STATE for /gallery screenshots");

  test.use({
    storageState: process.env.PLAYWRIGHT_STORAGE_STATE,
  });

  for (const vp of VIEWPORTS) {
    test(`gallery full page @ ${vp.name}px`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/gallery");
      await expect(page.getByTestId("visual-system-gallery")).toBeVisible({
        timeout: 20_000,
      });
      // Stabilize shimmer / fonts
      await page.waitForTimeout(400);
      await expect(page.getByTestId("visual-system-gallery")).toHaveScreenshot(
        `gallery-${vp.name}.png`,
        {
          animations: "disabled",
          maxDiffPixelRatio: 0.02,
        }
      );
    });
  }

  test("gallery sections present for a11y contract", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/gallery");
    const root = page.getByTestId("visual-system-gallery");
    await expect(root).toBeVisible({ timeout: 20_000 });

    for (const id of [
      "feed-rows",
      "decision-drawer",
      "status",
      "risk",
      "empty",
      "loading",
      "error",
      "tones",
    ]) {
      await expect(page.locator(`[data-gallery-section="${id}"]`)).toBeVisible();
    }

    const badgeCounts = page.locator("[data-feed-row-v3] [data-testid=feed-row-badges] .tt-badge");
    // First feed row should expose ≤3 badges
    const firstRow = page.locator("[data-feed-row-v3]").first();
    const count = await firstRow.locator("[data-testid=feed-row-badges] .tt-badge").count();
    expect(count).toBeLessThanOrEqual(3);
    void badgeCounts;
  });
});
