import { expect, test } from "@playwright/test";

/**
 * Launch-critical first-ticker loop (mocked SEC / Stripe).
 * Harness: /e2e/research-harness
 */

const HARNESS = "/e2e/research-harness";

const processingReadiness = {
  readiness: {
    symbol: "RKLB",
    identityStatus: "READY",
    cik: "0001819994",
    name: "Rocket Lab USA, Inc.",
    covered: true,
    hydrationEnqueued: true,
    jobStatus: "RUNNING",
    identity: "READY",
    financials: "PROCESSING",
    capital: "PROCESSING",
    filings: "MISSING",
    insiders: "MISSING",
    ownership: "MISSING",
    institutional13F: "MISSING",
    datasets: {
      FINANCIALS: {
        status: "PROCESSING",
        lastAttemptAt: null,
        lastSuccessAt: null,
        dataAsOf: null,
        nextEligibleRefreshAt: null,
        rowCount: 0,
        lastErrorCode: null,
        lastErrorSummary: null,
      },
    },
  },
};

const readyReadiness = {
  readiness: {
    ...processingReadiness.readiness,
    hydrationEnqueued: false,
    jobStatus: "SUCCEEDED",
    financials: "READY",
    capital: "READY",
    filings: "READY",
    insiders: "READY",
    datasets: {
      FINANCIALS: {
        status: "READY",
        lastAttemptAt: new Date().toISOString(),
        lastSuccessAt: new Date().toISOString(),
        dataAsOf: new Date().toISOString(),
        nextEligibleRefreshAt: null,
        rowCount: 8,
        lastErrorCode: null,
        lastErrorSummary: null,
      },
    },
  },
};

const financialsReport = {
  report: {
    symbol: "RKLB",
    version: "1.0.0",
    asOf: new Date().toISOString(),
    empty: false,
    rows: [
      {
        metricKey: "revenue",
        label: "Revenue",
        current: {
          value: 106_256_000,
          periodLabel: "2026-Q1",
          fiscalYear: 2026,
          fiscalPeriod: "Q1",
          accession: "0001819994-26-000020",
          secConcept: "RevenueFromContractWithCustomerExcludingAssessedTax",
          sourceUrl: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001819994",
          unit: "USD",
          confidence: "high",
        },
        prior: { value: 62_000_000, periodLabel: "2025-Q1", unit: "USD" },
        basis: "yoy",
        basisLabel: "Year over year",
        percentChange: 71.4,
        bpsChange: null,
        comparable: true,
        emphasis: "material",
        changeLabel: "Higher",
        unavailableReason: null,
      },
      {
        metricKey: "gross_margin",
        label: "Gross margin",
        current: {
          value: 26.5,
          periodLabel: "2026-Q1",
          fiscalYear: 2026,
          fiscalPeriod: "Q1",
          accession: "0001819994-26-000020",
          unit: "percent",
          sourceUrl: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001819994",
          confidence: "high",
        },
        prior: { value: 22, unit: "percent" },
        basis: "yoy",
        basisLabel: "Year over year",
        percentChange: null,
        bpsChange: 450,
        comparable: true,
        emphasis: "material",
        changeLabel: "Higher",
        unavailableReason: null,
      },
      {
        metricKey: "cash",
        label: "Cash",
        current: {
          value: 400_000_000,
          periodLabel: "2026-Q1",
          accession: "0001819994-26-000020",
          unit: "USD",
          sourceUrl: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001819994",
        },
        prior: null,
        basis: null,
        basisLabel: "",
        percentChange: null,
        bpsChange: null,
        comparable: false,
        emphasis: "unavailable",
        changeLabel: "Unavailable",
        unavailableReason: null,
      },
      {
        metricKey: "shares_outstanding",
        label: "Shares outstanding",
        current: {
          value: 500_000_000,
          periodLabel: "2026-Q1",
          accession: "0001819994-26-000020",
          unit: "shares",
          sourceUrl: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001819994",
        },
        prior: null,
        basis: "yoy",
        basisLabel: "Year over year",
        percentChange: null,
        bpsChange: null,
        comparable: false,
        emphasis: "unavailable",
        changeLabel: "Unavailable",
        unavailableReason: null,
      },
    ],
  },
};

const capitalReport = {
  report: {
    symbol: "RKLB",
    version: "1.0.0",
    asOf: new Date().toISOString(),
    status: "unknown",
    statusLabel: "Unknown capital risk",
    summary: "Cash-flow history is insufficient to estimate runway.",
    reasonCodes: ["RUNWAY_UNKNOWN", "NO_INSTRUMENT_COVERAGE"],
    reasons: [
      {
        code: "RUNWAY_UNKNOWN",
        label: "Runway unknown",
        detail: "Cash-flow history is insufficient to estimate runway.",
        severity: "unknown",
      },
    ],
    liquidity: {
      cash: 400_000_000,
      cashAsOf: "2026-03-31T00:00:00.000Z",
      cashSourceUrl: null,
      operatingCashFlow: null,
      ocfAsOf: null,
      estimatedBurn: null,
      runwayQuarters: null,
      runwayStatus: "unknown",
      runwayExplanation: "Cash-flow history is insufficient to estimate runway.",
    },
    shareStructure: {
      sharesOutstanding: 500_000_000,
      sharesAsOf: "2026-03-31T00:00:00.000Z",
      sharesSourceUrl: null,
      yoyChangePercent: null,
      multiYearChangePercent: null,
      multiYearYears: null,
      explanation: "No comparable shares-outstanding observation is available.",
    },
    financingEvents: [],
    snapshotId: "snap-1",
    instrumentIds: [],
  },
  timeline: [],
};

const insidersReport = {
  report: {
    symbol: "RKLB",
    version: "1.0.0",
    asOf: new Date().toISOString(),
    empty: false,
    transactions: [
      {
        id: "f4-1",
        ownerName: "Example Officer",
        role: "Officer",
        issuerName: "Rocket Lab",
        transactionDate: "2026-03-01",
        filedAt: new Date().toISOString(),
        transactionCode: "P",
        acquiredDisposed: "A",
        shares: 1000,
        pricePerShare: 10,
        transactionValue: 10000,
        isDirect: true,
        sharesOwnedAfter: 5000,
        holdingChange: 1000,
        classification: "open_market_purchase",
        classificationLabel: "Open-market purchase",
        is10b51: false,
        summaryText: "Open-market purchase of 1,000 shares.",
        sourceUrl: "https://www.sec.gov/",
        accessionNumber: "0001819994-26-000004",
      },
    ],
  },
};

test("launch-critical first ticker: search → preparing → ready financials → capital explainable", async ({
  page,
}) => {
  let hydrated = false;
  await page.route("**/api/research/RKLB/readiness", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(hydrated ? readyReadiness : processingReadiness),
    });
  });
  await page.route("**/api/ticker/RKLB/quarterly-delta", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        hydrated ? financialsReport : { report: { symbol: "RKLB", empty: true, rows: [], version: "1", asOf: new Date().toISOString() } }
      ),
    });
  });
  await page.route("**/api/ticker/RKLB/capital-risk", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(capitalReport),
    });
  });
  await page.route("**/api/ticker/RKLB/insiders", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(insidersReport),
    });
  });

  await page.goto(`${HARNESS}?entitled=1`);
  await page.getByTestId("research-ticker-input").fill("RKLB");
  await page.getByRole("button", { name: /^open$/i }).click();
  await page.getByTestId("research-tab-financials").click();
  await expect(page.getByTestId("research-financials-status")).toContainText(
    /Preparing financial data/i
  );

  hydrated = true;
  await expect(page.getByTestId("ticker-financials")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId("financials-metric-revenue")).toBeVisible();
  await expect(page.getByTestId("financials-metric-gross_margin")).toBeVisible();
  await expect(page.getByTestId("financials-metric-cash")).toBeVisible();
  await expect(page.getByTestId("financials-metric-shares_outstanding")).toBeVisible();
  await expect(page.getByRole("link", { name: /source filing/i }).first()).toBeVisible();

  await page.getByTestId("research-tab-capital").click();
  await expect(page.getByTestId("ticker-capital")).toBeVisible();
  await expect(page.getByTestId("capital-risk-status")).toContainText(/unknown|capital risk/i);

  await page.getByTestId("research-tab-insiders").click();
  await expect(page.getByTestId("ticker-insiders")).toBeVisible();
});
