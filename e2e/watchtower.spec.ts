import { expect, test } from "@playwright/test";

/**
 * Watchtower primary mode e2e.
 * Authenticated flows need PLAYWRIGHT_STORAGE_STATE.
 */

const hasAuth = Boolean(process.env.PLAYWRIGHT_STORAGE_STATE);

test.describe("Watchtower primary nav (public-adjacent)", () => {
  test("unauthenticated watchtower deep link still redirects", async ({
    page,
  }) => {
    await page.goto("/dashboard?shell=v3&view=watchtower");
    await page.waitForURL(/\/(demo|login)/);
    expect(page.url()).toMatch(/\/(demo|login)/);
  });

  test("watchtower API denies without session", async ({ request }) => {
    const res = await request.get("/api/watchtower");
    expect([401, 403]).toContain(res.status());
  });
});

test.describe("authenticated Watchtower", () => {
  test.skip(!hasAuth, "Set PLAYWRIGHT_STORAGE_STATE for authenticated e2e");

  test.use({
    storageState: process.env.PLAYWRIGHT_STORAGE_STATE,
  });

  test("primary nav shows Portfolio Watchtower Research Discover", async ({
    page,
  }) => {
    await page.goto("/dashboard?shell=v3&view=portfolio");
    await expect(page.locator('[data-shell="v3"]')).toBeVisible();
    await expect(page.getByTestId("panel-toggle-portfolio")).toBeVisible();
    await expect(page.getByTestId("panel-toggle-watchtower")).toBeVisible();
    await expect(page.getByTestId("panel-toggle-research")).toBeVisible();
    await expect(page.getByTestId("panel-toggle-discover")).toBeVisible();
    await expect(page.getByTestId("panel-toggle-markets")).toHaveCount(0);
    await expect(page.getByTestId("panel-toggle-structure")).toHaveCount(0);
  });

  test("Watchtower mode loads with filters and empty/or feed states", async ({
    page,
  }) => {
    await page.goto("/dashboard?shell=v3&view=watchtower");
    await expect(page.getByTestId("watchtower-desk")).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("Material changes across the companies you monitor.")).toBeVisible();
    await expect(page.getByTestId("watchtower-filters")).toBeVisible();
    await expect(page.getByTestId("watchtower-filter-high")).toBeVisible();
    await expect(page.getByTestId("watchtower-summary")).toBeVisible();

    // One of: loading finished into empty portfolio, empty events, error, or feed
    await expect(
      page
        .getByTestId("watchtower-empty-portfolio")
        .or(page.getByTestId("watchtower-empty-events"))
        .or(page.getByTestId("watchtower-feed"))
        .or(page.getByTestId("watchtower-error"))
    ).toBeVisible({ timeout: 20_000 });
  });

  test("filter chips are pressable and Discover opens", async ({ page }) => {
    await page.goto("/dashboard?shell=v3&view=watchtower");
    await expect(page.getByTestId("watchtower-desk")).toBeVisible({
      timeout: 20_000,
    });
    await page.getByTestId("watchtower-filter-capital").click();
    await expect(page.getByTestId("watchtower-filter-capital")).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await page.getByTestId("panel-toggle-discover").click();
    await expect(page.getByTestId("discover-desk")).toBeVisible();
    await expect(page).toHaveURL(/view=discover/);
  });

  test("event card opens drawer when feed has rows", async ({ page }) => {
    await page.goto("/dashboard?shell=v3&view=watchtower");
    await expect(page.getByTestId("watchtower-desk")).toBeVisible({
      timeout: 20_000,
    });
    const feed = page.getByTestId("watchtower-feed");
    if ((await feed.count()) === 0) {
      test.skip(true, "No Watchtower events for this account yet");
      return;
    }
    const card = feed.locator("[data-watchtower-card]").first();
    await card.focus();
    await card.press("Enter");
    await expect(page.getByTestId("watchtower-drawer-panel")).toBeVisible();
    await expect(page.getByTestId("watchtower-drawer-close")).toBeVisible();
    await page.getByTestId("watchtower-drawer-close").click();
    await expect(page.getByTestId("watchtower-drawer-closed")).toBeAttached();
  });
});
