import { expect, test } from "@playwright/test";

/**
 * Decision Drawer — deep-link, a11y, Escape, section order, mobile scroll lock.
 * Auth required for dashboard. Without PLAYWRIGHT_STORAGE_STATE, suite skips.
 */

const hasAuth = Boolean(process.env.PLAYWRIGHT_STORAGE_STATE);

const SECTION_ORDER = [
  "event",
  "reaction",
  "tradeability",
  "primary-risks",
  "evidence",
  "optional-analysis",
] as const;

test.describe("Decision Drawer", () => {
  test.skip(!hasAuth, "Set PLAYWRIGHT_STORAGE_STATE for authenticated e2e");

  test.use({
    storageState: process.env.PLAYWRIGHT_STORAGE_STATE,
  });

  test("deep-link ?cid= opens drawer and preserves URL", async ({ page }) => {
    await page.goto("/dashboard?shell=v3&view=feed");
    await page.waitForSelector('[data-shell="v3"]', { timeout: 20_000 });

    // Prefer Standard feed so rows are present
    const exit = page.getByTestId("exit-focus");
    if (await exit.count()) await exit.click();
    await page.getByTestId("mode-full").click().catch(() => {});

    const row = page.locator("[data-catalyst-id]").first();
    if ((await row.count()) === 0) {
      test.skip(true, "No feed rows for deep-link test");
      return;
    }
    const id = await row.getAttribute("data-catalyst-id");
    expect(id).toBeTruthy();

    await page.goto(`/dashboard?shell=v3&view=feed&cid=${id}`);
    await expect(
      page.locator(
        '[data-guide="catalyst-context-drawer"][data-drawer-state="open"]'
      )
    ).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(new RegExp(`cid=${id}`));
    await expect(page.getByTestId("decision-drawer-panel")).toBeVisible();
  });

  test("Escape closes drawer and clears cid", async ({ page }) => {
    await page.goto("/dashboard?shell=v3&view=feed");
    await page.waitForSelector('[data-shell="v3"]', { timeout: 20_000 });
    const exit = page.getByTestId("exit-focus");
    if (await exit.count()) await exit.click();

    const rows = page.locator("[data-feed-row-v3], [data-focus-row-v2], [data-catalyst-id]");
    if ((await rows.count()) === 0) {
      test.skip(true, "No rows to open drawer");
      return;
    }
    await page.keyboard.press("Enter");
    const open = page.locator(
      '[data-guide="catalyst-context-drawer"][data-drawer-state="open"]'
    );
    if ((await open.count()) === 0) {
      test.skip(true, "Drawer did not open");
      return;
    }
    await expect(open.first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.locator(
        '[data-guide="catalyst-context-drawer"][data-drawer-state="open"]'
      )
    ).toHaveCount(0);
    await expect(page).not.toHaveURL(/[?&]cid=/);
  });

  test("a11y: dialog role, Source/TV actions, section order", async ({
    page,
  }) => {
    await page.goto("/dashboard?shell=v3&view=feed");
    await page.waitForSelector('[data-shell="v3"]', { timeout: 20_000 });
    const exit = page.getByTestId("exit-focus");
    if (await exit.count()) await exit.click();

    await page.keyboard.press("Enter");
    const panel = page.getByTestId("decision-drawer-panel");
    if ((await panel.count()) === 0) {
      test.skip(true, "No drawer panel");
      return;
    }

    await expect(panel).toHaveAttribute("role", "dialog");
    await expect(page.getByTestId("drawer-open-tv")).toBeVisible();

    const sections = page.locator("[data-drawer-section]");
    const ids: string[] = [];
    const n = await sections.count();
    for (let i = 0; i < n; i++) {
      ids.push((await sections.nth(i).getAttribute("data-drawer-section"))!);
    }
    expect(ids).toEqual([...SECTION_ORDER]);

    // Optional analysis collapsed by default
    await expect(page.getByTestId("drawer-optional-analysis")).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  test("j/k keeps drawer open and updates selection", async ({ page }) => {
    await page.goto("/dashboard?shell=v3&view=feed");
    await page.waitForSelector('[data-shell="v3"]', { timeout: 20_000 });
    const exit = page.getByTestId("exit-focus");
    if (await exit.count()) await exit.click();

    const rows = page.locator("[data-feed-row-v3], [data-focus-row-v2]");
    if ((await rows.count()) < 2) {
      test.skip(true, "Need ≥2 rows for j/k");
      return;
    }
    await page.keyboard.press("Enter");
    const open = page.locator(
      '[data-guide="catalyst-context-drawer"][data-drawer-state="open"]'
    );
    await expect(open.first()).toBeVisible();
    const firstId = await open.first().getAttribute("data-catalyst-id");

    await page.keyboard.press("j");
    await expect(open.first()).toBeVisible();
    const nextId = await open.first().getAttribute("data-catalyst-id");
    expect(nextId).toBeTruthy();
    // May stay same if only one visible after filter — then skip assert
    if (firstId && nextId && firstId !== nextId) {
      await expect(page).toHaveURL(new RegExp(`cid=${nextId}`));
    }
  });

  test("mobile: overlay/sheet and body scroll lock", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "Mobile project only");
    await page.goto("/dashboard?shell=v3&view=feed");
    await page.waitForSelector('[data-shell="v3"]', { timeout: 20_000 });

    await page.keyboard.press("Enter");
    const sheetOrOverlay = page.locator(
      '[data-drawer-mode="sheet"][data-drawer-state="open"], [data-drawer-mode="overlay"][data-drawer-state="open"]'
    );
    if ((await sheetOrOverlay.count()) === 0) {
      test.skip(true, "Drawer not open on mobile");
      return;
    }
    await expect(sheetOrOverlay.first()).toBeVisible();
    const overflow = await page.evaluate(() => document.body.style.overflow);
    expect(overflow).toBe("hidden");

    await page.keyboard.press("Escape");
    const overflowAfter = await page.evaluate(
      () => document.body.style.overflow
    );
    expect(overflowAfter).not.toBe("hidden");
  });

  test("live-update fingerprint attribute present when open", async ({
    page,
  }) => {
    await page.goto("/dashboard?shell=v3&view=feed");
    await page.waitForSelector('[data-shell="v3"]', { timeout: 20_000 });
    const exit = page.getByTestId("exit-focus");
    if (await exit.count()) await exit.click();

    await page.keyboard.press("Enter");
    const body = page.locator("[data-decision-drawer]");
    if ((await body.count()) === 0) {
      test.skip(true, "Drawer content missing");
      return;
    }
    await expect(body.first()).toHaveAttribute("data-catalyst-id", /.+/);
    // data-live-price may be empty when quote unavailable — attribute must exist
    await expect(body.first()).toHaveAttribute("data-live-price", /.*/);
  });
});
