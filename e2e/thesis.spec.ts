import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * Thesis section UI + API access control.
 * CRUD flows use /e2e/thesis-harness with mocked /api/thesis* (no auth required).
 * Authenticated live ticker tests run when PLAYWRIGHT_STORAGE_STATE is set.
 */

type MockCondition = {
  id: string;
  conditionType: string;
  label: string;
  polarity: string;
  params: Record<string, unknown>;
  sortOrder: number;
  evaluation: {
    mode: "automated" | "manual";
    state: "PASS" | "WARN" | "FAIL" | "UNKNOWN" | null;
    explanation?: string;
    actualValue?: number | null;
    threshold?: number | null;
    evaluatedAt?: string;
    evidence?: { sourceType: string; label: string; sourceUrl?: string };
  };
  createdAt: string;
  updatedAt: string;
};

type MockThesis = {
  id: string;
  symbol: string;
  title: string | null;
  note: string | null;
  status: string;
  healthStatus: string;
  lastEvaluatedAt: string | null;
  healthSummary: {
    passing: number;
    warning: number;
    failed: number;
    unknown: number;
    manual: number;
  } | null;
  createdAt: string;
  updatedAt: string;
  conditions: MockCondition[];
};

function nowIso() {
  return new Date().toISOString();
}

function summarize(thesis: MockThesis) {
  let passing = 0;
  let warning = 0;
  let failed = 0;
  let unknown = 0;
  let manual = 0;
  for (const c of thesis.conditions) {
    if (c.evaluation.mode === "manual") {
      manual += 1;
      continue;
    }
    if (c.evaluation.state === "PASS") passing += 1;
    else if (c.evaluation.state === "WARN") warning += 1;
    else if (c.evaluation.state === "FAIL") failed += 1;
    else unknown += 1;
  }
  thesis.healthSummary = { passing, warning, failed, unknown, manual };
}

async function installThesisMock(page: Page) {
  let thesis: MockThesis | null = null;
  let conditionSeq = 0;

  const fulfillJson = async (route: Route, status: number, body: unknown) => {
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  };

  await page.route(/\/api\/thesis/, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();

    // GET /api/thesis?symbol=
    if (method === "GET" && path === "/api/thesis") {
      await fulfillJson(route, 200, {
        theses: thesis ? [thesis] : [],
      });
      return;
    }

    // POST /api/thesis
    if (method === "POST" && path === "/api/thesis") {
      const body = req.postDataJSON() as {
        symbol?: string;
        note?: string | null;
      };
      const tNow = nowIso();
      thesis = {
        id: "thesis-demo-1",
        symbol: (body.symbol ?? "DEMO").toUpperCase(),
        title: null,
        note: body.note ?? null,
        status: "active",
        healthStatus: "unknown",
        lastEvaluatedAt: null,
        healthSummary: {
          passing: 0,
          warning: 0,
          failed: 0,
          unknown: 0,
          manual: 0,
        },
        createdAt: tNow,
        updatedAt: tNow,
        conditions: [],
      };
      await fulfillJson(route, 200, { thesis });
      return;
    }

    // PATCH /api/thesis/:id
    const thesisMatch = path.match(/^\/api\/thesis\/([^/]+)$/);
    if (thesisMatch && method === "PATCH") {
      if (!thesis || thesis.id !== thesisMatch[1]) {
        await fulfillJson(route, 404, {
          error: "Thesis not found",
          code: "NOT_FOUND",
        });
        return;
      }
      const body = req.postDataJSON() as { note?: string | null };
      if (body.note !== undefined) thesis.note = body.note;
      thesis.updatedAt = nowIso();
      await fulfillJson(route, 200, { thesis });
      return;
    }

    // POST /api/thesis/:id/conditions
    const addCond = path.match(/^\/api\/thesis\/([^/]+)\/conditions$/);
    if (addCond && method === "POST") {
      if (!thesis || thesis.id !== addCond[1]) {
        await fulfillJson(route, 404, {
          error: "Thesis not found",
          code: "NOT_FOUND",
        });
        return;
      }
      const body = req.postDataJSON() as {
        conditionType: string;
        label: string;
        polarity?: string;
        params: Record<string, unknown>;
      };
      conditionSeq += 1;
      const id = `cond-${conditionSeq}`;
      const isManual = body.conditionType === "CUSTOM_MANUAL";
      const threshold =
        typeof body.params.thresholdPercent === "number"
          ? body.params.thresholdPercent
          : typeof body.params.threshold === "number"
            ? body.params.threshold
            : null;
      thesis.conditions.push({
        id,
        conditionType: body.conditionType,
        label: body.label,
        polarity: body.polarity ?? "support_if",
        params: body.params,
        sortOrder: thesis.conditions.length,
        evaluation: isManual
          ? {
              mode: "manual",
              state: null,
              explanation:
                "Manual — TrustTicker cannot verify this automatically.",
            }
          : {
              mode: "automated",
              state: "PASS",
              explanation: "Mock evaluation for e2e",
              actualValue:
                typeof body.params.thresholdPercent === "number"
                  ? Number(body.params.thresholdPercent) + 2
                  : 31.4,
              threshold,
              evaluatedAt: nowIso(),
              evidence: {
                sourceType: "metric_observation",
                label: "Mock filing source",
                sourceUrl: "https://www.sec.gov/Archives/edgar/data/1/a.htm",
              },
            },
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      summarize(thesis);
      await fulfillJson(route, 200, { thesis, conditionId: id });
      return;
    }

    // PATCH/DELETE /api/thesis/:id/conditions/:cid
    const condMatch = path.match(
      /^\/api\/thesis\/([^/]+)\/conditions\/([^/]+)$/
    );
    if (condMatch && (method === "PATCH" || method === "DELETE")) {
      if (!thesis || thesis.id !== condMatch[1]) {
        await fulfillJson(route, 404, {
          error: "Thesis not found",
          code: "NOT_FOUND",
        });
        return;
      }
      const cid = condMatch[2]!;
      const idx = thesis.conditions.findIndex((c) => c.id === cid);
      if (idx < 0) {
        await fulfillJson(route, 404, {
          error: "Condition not found",
          code: "NOT_FOUND",
        });
        return;
      }
      if (method === "DELETE") {
        thesis.conditions.splice(idx, 1);
        thesis.conditions.forEach((c, i) => {
          c.sortOrder = i;
        });
        summarize(thesis);
        await fulfillJson(route, 200, { thesis, conditionId: cid });
        return;
      }
      const body = req.postDataJSON() as {
        conditionType?: string;
        label?: string;
        polarity?: string;
        params?: Record<string, unknown>;
      };
      const row = thesis.conditions[idx]!;
      if (body.conditionType) row.conditionType = body.conditionType;
      if (body.label) row.label = body.label;
      if (body.polarity) row.polarity = body.polarity;
      if (body.params) {
        row.params = body.params;
        if (
          row.evaluation.mode === "automated" &&
          typeof body.params.thresholdPercent === "number"
        ) {
          row.evaluation.threshold = body.params.thresholdPercent;
          row.evaluation.actualValue = body.params.thresholdPercent + 1;
        }
      }
      row.updatedAt = nowIso();
      summarize(thesis);
      await fulfillJson(route, 200, { thesis, conditionId: cid });
      return;
    }

    // PUT reorder
    const reorderMatch = path.match(
      /^\/api\/thesis\/([^/]+)\/conditions\/reorder$/
    );
    if (reorderMatch && method === "PUT") {
      if (!thesis || thesis.id !== reorderMatch[1]) {
        await fulfillJson(route, 404, {
          error: "Thesis not found",
          code: "NOT_FOUND",
        });
        return;
      }
      const body = req.postDataJSON() as { orderedIds: string[] };
      const map = new Map(thesis.conditions.map((c) => [c.id, c]));
      thesis.conditions = body.orderedIds.map((id, i) => {
        const c = map.get(id)!;
        c.sortOrder = i;
        return c;
      });
      await fulfillJson(route, 200, { thesis });
      return;
    }

    await fulfillJson(route, 404, { error: "Unhandled mock route" });
  });

  return {
    getThesis: () => thesis,
  };
}

test.describe("Thesis ticker navigation", () => {
  test("ticker hub exposes full workspace tabs including Thesis", async ({
    page,
  }) => {
    await page.goto("/ticker/AAPL");
    await expect(page.getByTestId("ticker-workspace-tabs")).toBeVisible();
    for (const id of [
      "overview",
      "what-changed",
      "thesis",
      "financials",
      "capital",
      "insiders",
      "ownership",
      "filings",
      "timeline",
    ]) {
      await expect(page.getByTestId(`ticker-tab-${id}`)).toBeVisible();
    }
    await page.getByTestId("ticker-tab-thesis").click();
    await expect(page).toHaveURL(/tab=thesis/);
    await expect(
      page.getByTestId("thesis-unauthorized").or(page.getByTestId("thesis-empty")).or(page.getByTestId("thesis-panel")).or(page.getByTestId("thesis-loading"))
    ).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Thesis API unauthorized access", () => {
  test("thesis list requires auth", async ({ request }) => {
    const res = await request.get("/api/thesis");
    expect([401, 403]).toContain(res.status());
  });

  test("cannot read another user's thesis by id without session", async ({
    request,
  }) => {
    const res = await request.get("/api/thesis/someone-elses-thesis-id");
    expect([401, 403, 404]).toContain(res.status());
    if (res.status() === 200) {
      throw new Error("Unauthorized session must not receive thesis payload");
    }
  });

  test("cannot mutate foreign thesis without session", async ({ request }) => {
    const patch = await request.patch("/api/thesis/foreign-id", {
      data: { note: "hijack" },
    });
    expect([401, 403, 404]).toContain(patch.status());

    const add = await request.post("/api/thesis/foreign-id/conditions", {
      data: {
        conditionType: "METRIC_GROWTH_ABOVE",
        label: "x",
        params: { metricKey: "revenue", thresholdPercent: 25 },
      },
    });
    expect([401, 403, 404]).toContain(add.status());
  });
});

test.describe("Thesis harness CRUD (mocked persistence)", () => {
  test.beforeEach(async ({ page }) => {
    await installThesisMock(page);
    const res = await page.goto("/e2e/thesis-harness");
    // Harness may 404 if production gate — skip
    if (res && res.status() === 404) {
      test.skip(true, "E2E thesis harness not enabled");
    }
  });

  test("create thesis, add metric condition, edit threshold, delete, reorder, refresh", async ({
    page,
  }) => {
    if (page.url().includes("404") || (await page.getByText("404").count())) {
      test.skip(true, "E2E thesis harness not enabled");
      return;
    }

    await expect(page.getByTestId("thesis-empty")).toBeVisible();
    await expect(
      page.getByText(
        "Write down why you own this company. TrustTicker can monitor the measurable parts."
      )
    ).toBeVisible();

    await page.getByTestId("thesis-note-input").fill("Own for durable growth");
    await page.getByTestId("thesis-create").click();
    await expect(page.getByTestId("thesis-panel")).toBeVisible();
    await expect(page.getByTestId("thesis-note-display")).toContainText(
      "Own for durable growth"
    );

    // Add metric growth condition
    await page.getByTestId("thesis-add-condition").click();
    await expect(page.getByTestId("thesis-condition-builder")).toBeVisible();
    await page.getByTestId("thesis-builder-kind").selectOption("metric_growth");
    await page.getByTestId("thesis-builder-metric").selectOption("revenue");
    await page.getByTestId("thesis-builder-rule").selectOption("above");
    await page.getByTestId("thesis-builder-threshold").fill("25");
    await page.getByTestId("thesis-builder-period").selectOption("yoy");
    await page.getByTestId("thesis-builder-submit").click();
    await expect(page.getByTestId("thesis-banner")).toHaveCount(0);
    await expect(page.getByTestId("thesis-condition-list")).toBeVisible();

    const firstCard = page.locator("[data-condition-id]").first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });
    await expect(firstCard).toContainText(/Revenue growth stays above 25/i);
    await expect(firstCard.getByTestId("thesis-condition-status")).toContainText(
      /Intact|Needs review|Unknown/i
    );
    // No raw enum leakage
    await expect(page.locator("body")).not.toContainText("METRIC_GROWTH_ABOVE");

    // Add second condition for reorder
    await page.getByTestId("thesis-add-condition").click();
    await page.getByTestId("thesis-builder-kind").selectOption("event");
    await page.getByTestId("thesis-builder-event").selectOption("atm_program");
    await page.getByTestId("thesis-builder-event-rule").selectOption("does_not_occur");
    await page.getByTestId("thesis-builder-submit").click();

    const cards = page.locator("[data-condition-id]");
    await expect(cards).toHaveCount(2);
    const firstIdBefore = await cards.nth(0).getAttribute("data-condition-id");
    await cards.nth(1).getByTestId("thesis-condition-move-up").click();
    const firstIdAfter = await cards.nth(0).getAttribute("data-condition-id");
    expect(firstIdAfter).not.toEqual(firstIdBefore);

    // Edit threshold on a growth condition
    const growthCard = page
      .locator("[data-condition-id]")
      .filter({ hasText: /Revenue growth/i })
      .first();
    await growthCard.getByTestId("thesis-condition-edit").click();
    await expect(page.getByTestId("thesis-condition-builder")).toBeVisible();
    await page.getByTestId("thesis-builder-threshold").fill("30");
    await page.getByTestId("thesis-builder-submit").click();
    await expect(page.getByText(/stays above 30%/i)).toBeVisible();

    // Delete event condition
    const eventCard = page
      .locator("[data-condition-id]")
      .filter({ hasText: /ATM financing/i })
      .first();
    await eventCard.getByTestId("thesis-condition-remove").click();
    await expect(
      page.locator("[data-condition-id]").filter({ hasText: /ATM financing/i })
    ).toHaveCount(0);

    // Refresh persistence
    await page.getByTestId("thesis-refresh").click();
    await expect(page.getByTestId("thesis-panel")).toBeVisible();
    await expect(page.getByText(/stays above 30%/i)).toBeVisible();
    await expect(page.getByTestId("thesis-note-display")).toContainText(
      "Own for durable growth"
    );
  });
});

const hasAuth = Boolean(process.env.PLAYWRIGHT_STORAGE_STATE);

test.describe("authenticated Thesis on ticker", () => {
  test.skip(!hasAuth, "Set PLAYWRIGHT_STORAGE_STATE for authenticated e2e");

  test.use({
    storageState: process.env.PLAYWRIGHT_STORAGE_STATE,
  });

  test("ticker thesis tab loads entitled panel", async ({ page }) => {
    await page.goto("/ticker/AAPL?tab=thesis");
    await expect(
      page
        .getByTestId("thesis-panel")
        .or(page.getByTestId("thesis-empty"))
        .or(page.getByTestId("thesis-unauthorized"))
    ).toBeVisible({ timeout: 20_000 });
    // Entitled users should not see unauthorized gate
    if ((await page.getByTestId("thesis-unauthorized").count()) > 0) {
      test.skip(true, "Storage state user is not entitled");
    }
    await expect(page.getByText("Investment Thesis")).toBeVisible();
  });
});
