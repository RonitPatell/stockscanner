/**
 * Sanitized SEC companyfacts-style fixtures (not live SEC dumps).
 * Three issuer styles: modern revenue tag, legacy SalesRevenueNet, sparse.
 */

import type { SecCompanyfactsDocument } from "../../src/lib/metrics/types.ts";

/** Style A — modern software/tech us-gaap revenue concept */
export const FIXTURE_TECH_COMPANYFACTS: SecCompanyfactsDocument = {
  cik: 320193,
  entityName: "Fixture Tech Inc",
  facts: {
    "us-gaap": {
      RevenueFromContractWithCustomerExcludingAssessedTax: {
        label: "Revenue",
        units: {
          USD: [
            {
              start: "2023-10-01",
              end: "2024-09-28",
              val: 100_000,
              accn: "0000320193-24-000100",
              fy: 2024,
              fp: "FY",
              form: "10-K",
              filed: "2024-11-01",
            },
            {
              start: "2022-10-01",
              end: "2023-09-30",
              val: 80_000,
              accn: "0000320193-23-000100",
              fy: 2023,
              fp: "FY",
              form: "10-K",
              filed: "2023-11-02",
            },
            {
              start: "2024-04-01",
              end: "2024-06-29",
              val: 28_000,
              accn: "0000320193-24-000050",
              fy: 2024,
              fp: "Q3",
              form: "10-Q",
              filed: "2024-08-01",
            },
            {
              start: "2024-01-01",
              end: "2024-03-30",
              val: 25_000,
              accn: "0000320193-24-000040",
              fy: 2024,
              fp: "Q2",
              form: "10-Q",
              filed: "2024-05-02",
            },
            {
              start: "2023-04-01",
              end: "2023-07-01",
              val: 22_000,
              accn: "0000320193-23-000050",
              fy: 2023,
              fp: "Q3",
              form: "10-Q",
              filed: "2023-08-03",
            },
          ],
        },
      },
      GrossProfit: {
        units: {
          USD: [
            {
              start: "2024-04-01",
              end: "2024-06-29",
              val: 14_000,
              accn: "0000320193-24-000050",
              fy: 2024,
              fp: "Q3",
              form: "10-Q",
              filed: "2024-08-01",
            },
            {
              start: "2023-04-01",
              end: "2023-07-01",
              val: 10_000,
              accn: "0000320193-23-000050",
              fy: 2023,
              fp: "Q3",
              form: "10-Q",
              filed: "2023-08-03",
            },
          ],
        },
      },
      OperatingIncomeLoss: {
        units: {
          USD: [
            {
              start: "2024-04-01",
              end: "2024-06-29",
              val: 7_000,
              accn: "0000320193-24-000050",
              fy: 2024,
              fp: "Q3",
              form: "10-Q",
              filed: "2024-08-01",
            },
          ],
        },
      },
      NetIncomeLoss: {
        units: {
          USD: [
            {
              start: "2024-04-01",
              end: "2024-06-29",
              val: 5_000,
              accn: "0000320193-24-000050",
              fy: 2024,
              fp: "Q3",
              form: "10-Q",
              filed: "2024-08-01",
            },
          ],
        },
      },
      NetCashProvidedByUsedInOperatingActivities: {
        units: {
          USD: [
            {
              start: "2024-04-01",
              end: "2024-06-29",
              val: 9_000,
              accn: "0000320193-24-000050",
              fy: 2024,
              fp: "Q3",
              form: "10-Q",
              filed: "2024-08-01",
            },
          ],
        },
      },
      PaymentsToAcquirePropertyPlantAndEquipment: {
        units: {
          USD: [
            {
              start: "2024-04-01",
              end: "2024-06-29",
              val: 2_000,
              accn: "0000320193-24-000050",
              fy: 2024,
              fp: "Q3",
              form: "10-Q",
              filed: "2024-08-01",
            },
          ],
        },
      },
      CashAndCashEquivalentsAtCarryingValue: {
        units: {
          USD: [
            {
              end: "2024-06-29",
              val: 50_000,
              accn: "0000320193-24-000050",
              fy: 2024,
              fp: "Q3",
              form: "10-Q",
              filed: "2024-08-01",
            },
          ],
        },
      },
      WeightedAverageNumberOfDilutedSharesOutstanding: {
        units: {
          shares: [
            {
              start: "2024-04-01",
              end: "2024-06-29",
              val: 1_000,
              accn: "0000320193-24-000050",
              fy: 2024,
              fp: "Q3",
              form: "10-Q",
              filed: "2024-08-01",
            },
            {
              start: "2023-04-01",
              end: "2023-07-01",
              val: 900,
              accn: "0000320193-23-000050",
              fy: 2023,
              fp: "Q3",
              form: "10-Q",
              filed: "2023-08-03",
            },
          ],
        },
      },
      EarningsPerShareDiluted: {
        units: {
          "USD/shares": [
            {
              start: "2024-04-01",
              end: "2024-06-29",
              val: 5.0,
              accn: "0000320193-24-000050",
              fy: 2024,
              fp: "Q3",
              form: "10-Q",
              filed: "2024-08-01",
            },
          ],
        },
      },
    },
    dei: {
      EntityCommonStockSharesOutstanding: {
        units: {
          shares: [
            {
              end: "2024-06-29",
              val: 1_050,
              accn: "0000320193-24-000050",
              fy: 2024,
              fp: "Q3",
              form: "10-Q",
              filed: "2024-08-01",
            },
          ],
        },
      },
    },
  },
};

/** Style B — legacy SalesRevenueNet alias (no modern revenue tag) */
export const FIXTURE_LEGACY_REVENUE_COMPANYFACTS: SecCompanyfactsDocument = {
  cik: 789012,
  entityName: "Fixture Legacy Corp",
  facts: {
    "us-gaap": {
      SalesRevenueNet: {
        units: {
          USD: [
            {
              start: "2024-01-01",
              end: "2024-03-31",
              val: 12_000,
              accn: "0000789012-24-000010",
              fy: 2024,
              fp: "Q1",
              form: "10-Q",
              filed: "2024-05-10",
            },
            {
              start: "2023-01-01",
              end: "2023-03-31",
              val: 10_000,
              accn: "0000789012-23-000010",
              fy: 2023,
              fp: "Q1",
              form: "10-Q",
              filed: "2023-05-11",
            },
          ],
        },
      },
      GrossProfit: {
        units: {
          USD: [
            {
              start: "2024-01-01",
              end: "2024-03-31",
              val: 4_800,
              accn: "0000789012-24-000010",
              fy: 2024,
              fp: "Q1",
              form: "10-Q",
              filed: "2024-05-10",
            },
          ],
        },
      },
    },
  },
};

/**
 * Style C — sparse issuer: cash + debt + shares, no P&L revenue.
 * Also includes an incompatible stub duration that must not YoY-match.
 */
export const FIXTURE_SPARSE_COMPANYFACTS: SecCompanyfactsDocument = {
  cik: 1112223,
  entityName: "Fixture Sparse LLC",
  facts: {
    "us-gaap": {
      CashAndCashEquivalentsAtCarryingValue: {
        units: {
          USD: [
            {
              end: "2024-12-31",
              val: 3_000,
              accn: "0001112223-25-000001",
              fy: 2024,
              fp: "FY",
              form: "10-K",
              filed: "2025-03-01",
            },
          ],
        },
      },
      LongTermDebt: {
        units: {
          USD: [
            {
              end: "2024-12-31",
              val: 8_000,
              accn: "0001112223-25-000001",
              fy: 2024,
              fp: "FY",
              form: "10-K",
              filed: "2025-03-01",
            },
          ],
        },
      },
      // Incomparable stub: ~180 day "half year" labeled Q2 — must not YoY vs true quarter
      NetIncomeLoss: {
        units: {
          USD: [
            {
              start: "2024-01-01",
              end: "2024-06-30",
              val: 100,
              accn: "0001112223-24-000099",
              fy: 2024,
              fp: "Q2",
              form: "8-K",
              filed: "2024-07-15",
            },
            {
              start: "2023-04-01",
              end: "2023-06-30",
              val: 90,
              accn: "0001112223-23-000050",
              fy: 2023,
              fp: "Q2",
              form: "10-Q",
              filed: "2023-08-01",
            },
          ],
        },
      },
    },
    dei: {
      EntityCommonStockSharesOutstanding: {
        units: {
          shares: [
            {
              end: "2024-12-31",
              val: 500,
              accn: "0001112223-25-000001",
              fy: 2024,
              fp: "FY",
              form: "10-K",
              filed: "2025-03-01",
            },
          ],
        },
      },
    },
  },
};
