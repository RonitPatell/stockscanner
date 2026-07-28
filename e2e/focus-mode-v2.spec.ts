import { expect, test } from "@playwright/test";

/**
 * Focus Mode V2 e2e.
 * Auth required for dashboard. Without PLAYWRIGHT_STORAGE_STATE, suite skips.
 */

const hasAuth = Boolean(process.env.PLAYWRIGHT_STORAGE_STATE);

test.describe("Focus Mode V2", () => {
  test.skip(!hasAuth, "Set PLAYWRIGHT_STORAGE_STATE for authenticated e2e");

  test.use({
    storageState: process.env.PLAYWRIGHT_STORAGE_STATE,
  });

  test("enter and exit Focus Mode", async ({ page }) => {
    await page.goto("/dashboard?shell=v3&view=feed&focus=1");
    await expect(page.getByTestId("focus-mode-v2")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("exit-focus")).toBeVisible();
    await expect(page.getByTestId("nav-plan")).toHaveCount(0);

    await page.getByTestId("exit-focus").click();
    await expect(page.getByTestId("mode-full")).toBeVisible();
    await expect(page.getByTestId("mode-focus")).toBeVisible();
    await expect(page.getByTestId("nav-plan")).toBeVisible();

    await page.getByTestId("mode-focus").click();
    await expect(page.getByTestId("focus-mode-v2")).toBeVisible();
  });

  test("zero to five focus rows and empty actions", async ({ page }) => {
    await page.goto("/dashboard?shell=v3&view=feed&focus=1");
    await expect(page.getByTestId("focus-mode-v2")).toBeVisible({
      timeout: 20_000,
    });
    const rows = page.locator("[data-focus-row-v2]");
    const empty = page.getByTestId("focus-empty-state");
    const rowCount = await rows.count();
    expect(rowCount).toBeLessThanOrEqual(5);
    if (rowCount === 0) {
      await expect(empty).toBeVisible();
      await expect(page.getByTestId("focus-empty-edit-rules")).toBeVisible();
      await expect(page.getByTestId("focus-empty-show-all")).toBeVisible();
      await expect(page.getByTestId("focus-empty-watchlist")).toBeVisible();
    } else {
      await expect(empty).toHaveCount(0);
    }
  });

  test("squawk toggle present on Focus", async ({ page }) => {
    await page.goto("/dashboard?shell=v3&view=feed&focus=1");
    await expect(page.getByTestId("focus-squawk-toggle")).toBeVisible({
      timeout: 20_000,
    });
    await page.getByTestId("focus-squawk-toggle").click();
  });

  test("live disconnection indicator is compact", async ({ page }) => {
    await page.goto("/dashboard?shell=v3&view=feed&focus=1");
    await expect(page.getByTestId("focus-connection")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("focus-connection")).toContainText(
      /Live|Disconnected|Connecting/i
    );
  });

  test("keyboard navigation j/k and Enter", async ({ page }) => {
    await page.goto("/dashboard?shell=v3&view=feed&focus=1");
    await expect(page.getByTestId("focus-mode-v2")).toBeVisible({
      timeout: 20_000,
    });
    const rows = page.locator("[data-focus-row-v2]");
    if ((await rows.count()) === 0) {
      test.skip(true, "No focus rows to navigate");
      return;
    }
    await page.keyboard.press("j");
    await page.keyboard.press("k");
    await page.keyboard.press("Enter");
    await expect(
      page.locator('[data-guide="catalyst-context-drawer"]').first()
    ).toBeAttached();
  });

  test("mobile and tablet Focus chrome", async ({ page }, testInfo) => {
    await page.goto("/dashboard?shell=v3&view=feed&focus=1");
    await expect(page.getByTestId("focus-mode-v2")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("exit-focus")).toBeVisible();
    await expect(page.getByTestId("focus-filter-all")).toBeVisible();
    await expect(page.getByTestId("focus-filter-watchlist")).toBeVisible();
    await expect(page.getByTestId("focus-filter-strategy")).toBeVisible();
    // Plan/Risk/Review hidden in Focus on all viewports
    await expect(page.getByTestId("nav-risk")).toHaveCount(0);
    await expect(page.getByTestId("nav-review")).toHaveCount(0);
    void testInfo.project.name;
  });
});
