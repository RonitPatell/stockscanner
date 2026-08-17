import { expect, test } from "@playwright/test";

/**
 * Research Financials PROCESSING → READY without hitting SEC.
 * Harness: /e2e/research-harness
 */

const HARNESS = "/e2e/research-harness";

const emptyReport = {
  report: {
    symbol: "RKLB",
    version: "1.0.0",
    asOf: new Date().toISOString(),
    rows: [],
    empty: true,
  },
};

const readyReport = {
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
          value: 100,
          periodLabel: "Q1 2026",
          periodStart: null,
          periodEnd: null,
          fiscalYear: 2026,
          fiscalPeriod: "Q1",
          filedAt: null,
          accession: "000-test",
          secConcept: "RevenueFromContractWithCustomerExcludingAssessedTax",
          sourceUrl: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001819994",
          unit: "USD",
          confidence: "high",
        },
        prior: null,
        basis: "yoy",
        basisLabel: "Year over year",
        absoluteChange: null,
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

function readiness(status: "PROCESSING" | "READY") {
  return {
    readiness: {
      symbol: "RKLB",
      identityStatus: "READY",
      cik: "0001819994",
      name: "Rocket Lab USA, Inc.",
      covered: true,
      hydrationEnqueued: status === "PROCESSING",
      jobStatus: status === "PROCESSING" ? "RUNNING" : "SUCCEEDED",
      identity: "READY",
      financials: status,
      capital: status,
      filings: status,
      insiders: status,
      ownership: status,
      institutional13F: "MISSING",
      datasets: {
        FINANCIALS: {
          status,
          lastAttemptAt: null,
          lastSuccessAt: null,
          dataAsOf: null,
          nextEligibleRefreshAt: null,
          rowCount: status === "READY" ? 1 : 0,
          lastErrorCode: null,
          lastErrorSummary: null,
        },
      },
    },
  };
}

test("Financials show Preparing then Ready from mocked readiness", async ({
  page,
}) => {
  let ready = false;
  await page.route("**/api/research/RKLB/readiness", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(readiness(ready ? "READY" : "PROCESSING")),
    });
  });
  await page.route("**/api/ticker/RKLB/quarterly-delta", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(ready ? readyReport : emptyReport),
    });
  });

  await page.goto(`${HARNESS}?entitled=1`);
  await page.getByTestId("research-ticker-input").fill("RKLB");
  await page.getByRole("button", { name: /^open$/i }).click();
  await page.getByTestId("research-tab-financials").click();

  await expect(page.getByTestId("research-financials-status")).toContainText(
    /Preparing financial data/i
  );

  ready = true;
  await expect(page.getByTestId("ticker-financials")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId("research-financials-status")).toHaveCount(0);
});
