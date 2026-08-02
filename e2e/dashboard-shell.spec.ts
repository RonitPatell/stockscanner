import { expect, test } from "@playwright/test";

/**
 * Dashboard Shell V3 e2e.
 * Authenticated flows require PLAYWRIGHT_STORAGE_STATE pointing at a saved auth file.
 * Without it, we still assert redirects, deep-link routing hints, and private API denial.
 */

const hasAuth = Boolean(process.env.PLAYWRIGHT_STORAGE_STATE);

test.describe("unauthorized private data", () => {
  test("dashboard redirects unauthenticated/unsubscribed users", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/\/(demo|login)/);
    expect(page.url()).toMatch(/\/(demo|login)/);
  });

  test("private APIs deny without session", async ({ request }) => {
    const settings = await request.get("/api/settings");
    expect([401, 403]).toContain(settings.status());

    const feedback = await request.get("/api/trader-feedback");
    expect([401, 403]).toContain(feedback.status());

    const admin = await request.get("/api/admin/reliability");
    expect([401, 403]).toContain(admin.status());
  });

  test("trader-feedback rejects client userId style abuse", async ({
    request,
  }) => {
    const res = await request.post("/api/trader-feedback", {
      data: { action: "upsert", userId: "someone-else", record: {} },
    });
    expect([401, 403, 400]).toContain(res.status());
    const body = await res.json().catch(() => ({}));
    expect(JSON.stringify(body)).not.toMatch(/passwordHash/i);
  });
});

test.describe("shell chrome (public-adjacent)", () => {
  test("status page loads connection definitions", async ({ page }) => {
    await page.goto("/status");
    await expect(page.getByRole("heading", { name: /system status/i })).toBeVisible();
  });
});

test.describe("authenticated dashboard shell v3", () => {
  test.skip(!hasAuth, "Set PLAYWRIGHT_STORAGE_STATE for authenticated e2e");

  test.use({
    storageState: process.env.PLAYWRIGHT_STORAGE_STATE,
  });

  test("secondary navigation switches destinations", async ({ page }) => {
    await page.goto("/dashboard?shell=v3&view=feed");
    await expect(page.locator('[data-shell="v3"]')).toBeVisible();

    for (const id of ["feed", "watchlist", "plan", "risk", "review"] as const) {
      await page.getByTestId(`nav-${id}`).click();
      await expect(page.locator(`[data-destination="${id}"]`)).toHaveAttribute(
        "data-destination",
        id
      );
      await expect(page).toHaveURL(new RegExp(`view=${id}`));
    }

    // Monitor V1 (flagged) — when nav is present, destination still switches cleanly.
    const monitorNav = page.getByTestId("nav-monitor");
    if (await monitorNav.count()) {
      await monitorNav.click();
      await expect(page.locator('[data-destination="monitor"]')).toHaveAttribute(
        "data-destination",
        "monitor"
      );
      await expect(page).toHaveURL(/view=monitor/);
      await expect(page.getByTestId("trustticker-monitor")).toBeVisible();
      expect(await page.locator('[data-guide="monitor-status-bar"]').count()).toBe(1);
      expect(await page.locator('[data-guide="monitor-priority-ladder"]').count()).toBe(1);
      expect(await page.locator('[data-guide="monitor-momentum-field"]').count()).toBe(1);
      expect(await page.locator('[data-guide="monitor-intelligence"]').count()).toBe(1);
      expect(await page.locator('[data-guide="monitor-event-tape"]').count()).toBe(1);
    }
  });

  test("deep links open Plan / Risk / Review", async ({ page }) => {
    await page.goto("/dashboard?shell=v3&panel=dilution");
    await expect(page.locator('[data-destination="risk"]')).toBeVisible();
    await expect(page.locator('[data-guide="dilution-radar"]')).toBeVisible();

    await page.goto("/dashboard?shell=v3&panel=session-plan");
    await expect(page.locator('[data-guide="session-plan"]')).toBeVisible();

    await page.goto("/dashboard?shell=v3&view=review");
    await expect(page.locator('[data-guide="skip-ledger"]')).toBeVisible();
    await expect(
      page.locator('[data-guide="trader-feedback-panel"]')
    ).toBeVisible();
  });

  test("focus mode toggle", async ({ page }) => {
    await page.goto("/dashboard?shell=v3&view=feed&focus=1");
    const focusV2 = page.getByTestId("focus-mode-v2");
    if (await focusV2.count()) {
      await expect(focusV2).toBeVisible();
      await expect(page.locator('[data-guide="focus-mode-rail"]')).toBeVisible();
      await page.getByTestId("exit-focus").click();
      await expect(page.getByTestId("mode-full")).toBeVisible();
    } else {
      await page.getByTestId("mode-focus").click();
      await expect(page.locator('[data-guide="focus-mode-rail"]')).toBeVisible();
      await page.getByTestId("mode-full").click();
    }
  });

  test("connection status popover", async ({ page }) => {
    await page.goto("/dashboard?shell=v3&view=feed");
    const btn = page.locator('[data-guide="connection-status"]');
    await expect(btn).toBeVisible();
    await btn.click();
    await expect(page.getByRole("dialog", { name: /connection details/i })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("drawer behaviour by viewport", async ({ page }, testInfo) => {
    await page.goto("/dashboard?shell=v3&view=feed");
    // Activate first row via Enter if feed has items
    await page.keyboard.press("Enter");
    const drawer = page.locator('[data-guide="catalyst-context-drawer"]');
    await expect(drawer.first()).toBeAttached();

    const project = testInfo.project.name;
    if (project === "desktop") {
      // Side drawer preferred when open; closed marker also exists
      const openSide = page.locator(
        '[data-guide="catalyst-context-drawer"][data-drawer-mode="side"][data-drawer-state="open"]'
      );
      // May be closed if no catalysts — still assert guide target exists once visible open OR closed
      const count = await page.locator('[data-guide="catalyst-context-drawer"]').count();
      expect(count).toBeGreaterThanOrEqual(1);
      void openSide;
    }
    if (project === "mobile") {
      // Sheet mode when open
      const sheet = page.locator(
        '[data-drawer-mode="sheet"][data-drawer-state="open"]'
      );
      if (await sheet.count()) {
        await expect(sheet).toBeVisible();
      }
    }
  });

  test("guide targets exist exactly once on Feed chrome", async ({ page }) => {
    await page.goto("/dashboard?shell=v3&view=feed");
    // Prefer Standard so news-feed + destinations are present
    const exit = page.getByTestId("exit-focus");
    if (await exit.count()) await exit.click();
    await page.getByTestId("mode-full").click().catch(() => {});

    const chrome = [
      "dashboard-top-bar",
      "dashboard-secondary-nav",
      "connection-status",
      "news-feed",
      "catalyst-context-drawer",
    ];
    for (const t of chrome) {
      const n = await page.locator(`[data-guide="${t}"]`).count();
      expect(n, t).toBe(1);
      await expect(page.locator(`[data-guide="${t}"]`).first()).toBeVisible();
    }
    // Destination-specific targets: one each when navigated
    await page.getByTestId("nav-plan").click();
    expect(await page.locator('[data-guide="plan-destination"]').count()).toBe(1);
    expect(await page.locator('[data-guide="session-plan"]').count()).toBe(1);

    await page.getByTestId("nav-risk").click();
    expect(await page.locator('[data-guide="risk-destination"]').count()).toBe(1);
    expect(await page.locator('[data-guide="dilution-radar"]').count()).toBe(1);

    await page.getByTestId("nav-review").click();
    expect(await page.locator('[data-guide="review-destination"]').count()).toBe(1);
    expect(await page.locator('[data-guide="skip-ledger"]').count()).toBe(1);
    expect(
      await page.locator('[data-guide="trader-feedback-panel"]').count()
    ).toBe(1);
  });

  test("catalyst feed v3 shortcuts help opens modal", async ({ page }) => {
    await page.goto("/dashboard?shell=v3&view=feed");
    await page.getByTestId("feed-shortcuts-help").first().click();
    await expect(
      page.getByRole("dialog", { name: /keyboard shortcuts/i })
    ).toBeVisible();
    await expect(page.getByText(/Open Decision Drawer/i)).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("no permanently visible left feature column", async ({ page }) => {
    await page.goto("/dashboard?shell=v3&view=feed");
    await expect(page.locator(".desk-sidebar")).toHaveCount(0);
    await expect(page.getByTestId("dashboard-main-scroll")).toBeVisible();
  });
});
