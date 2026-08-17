/**
 * Sanitized companyfacts-shaped samples for compatibility tests.
 * Not live SEC dumps. Values are illustrative.
 */

import type { SecCompanyfactsDocument } from "../../src/lib/metrics/types.ts";
import {
  FIXTURE_LEGACY_REVENUE_COMPANYFACTS,
  FIXTURE_SPARSE_COMPANYFACTS,
  FIXTURE_TECH_COMPANYFACTS,
} from "./companyfacts.ts";

export { FIXTURE_TECH_COMPANYFACTS, FIXTURE_LEGACY_REVENUE_COMPANYFACTS, FIXTURE_SPARSE_COMPANYFACTS };

function usd(
  start: string,
  end: string,
  val: number,
  accn: string,
  fy: number,
  fp: string,
  form: string,
  filed: string
) {
  return { start, end, val, accn, fy, fp, form, filed };
}

function instant(
  end: string,
  val: number,
  accn: string,
  fy: number,
  fp: string,
  form: string,
  filed: string
) {
  return { end, val, accn, fy, fp, form, filed };
}

/** SaaS / modern revenue tag — alias of tech fixture. */
export const FIXTURE_SAAS_COMPANYFACTS = FIXTURE_TECH_COMPANYFACTS;

/** Bank: interest-heavy P&L; Revenues often absent. */
export const FIXTURE_BANK_COMPANYFACTS: SecCompanyfactsDocument = {
  cik: 36104,
  entityName: "Fixture Bank Corp",
  facts: {
    "us-gaap": {
      InterestAndDividendIncomeOperating: {
        units: {
          USD: [
            usd("2024-01-01", "2024-03-31", 4_000, "0000036104-24-000010", 2024, "Q1", "10-Q", "2024-05-01"),
            usd("2023-01-01", "2023-03-31", 3_200, "0000036104-23-000010", 2023, "Q1", "10-Q", "2023-05-02"),
          ],
        },
      },
      ProfitLoss: {
        units: {
          USD: [
            usd("2024-01-01", "2024-03-31", 900, "0000036104-24-000010", 2024, "Q1", "10-Q", "2024-05-01"),
          ],
        },
      },
      CashAndCashEquivalentsAtCarryingValue: {
        units: {
          USD: [instant("2024-03-31", 12_000, "0000036104-24-000010", 2024, "Q1", "10-Q", "2024-05-01")],
        },
      },
    },
  },
};

/** Industrial with Goods revenue alias. */
export const FIXTURE_INDUSTRIAL_COMPANYFACTS: SecCompanyfactsDocument = {
  cik: 40545,
  entityName: "Fixture Industrial Inc",
  facts: {
    "us-gaap": {
      SalesRevenueGoodsNet: {
        units: {
          USD: [
            usd("2024-04-01", "2024-06-30", 50_000, "0000040545-24-000020", 2024, "Q2", "10-Q", "2024-08-01"),
            usd("2023-04-01", "2023-06-30", 44_000, "0000040545-23-000020", 2023, "Q2", "10-Q", "2023-08-02"),
          ],
        },
      },
      GrossProfit: {
        units: {
          USD: [
            usd("2024-04-01", "2024-06-30", 12_000, "0000040545-24-000020", 2024, "Q2", "10-Q", "2024-08-01"),
          ],
        },
      },
      OperatingIncomeLoss: {
        units: {
          USD: [
            usd("2024-04-01", "2024-06-30", 4_000, "0000040545-24-000020", 2024, "Q2", "10-Q", "2024-08-01"),
          ],
        },
      },
      NetIncomeLoss: {
        units: {
          USD: [
            usd("2024-04-01", "2024-06-30", 2_800, "0000040545-24-000020", 2024, "Q2", "10-Q", "2024-08-01"),
          ],
        },
      },
    },
  },
};

/** Biotech: cash + losses, sparse revenue. */
export const FIXTURE_BIOTECH_COMPANYFACTS: SecCompanyfactsDocument = {
  cik: 1588978,
  entityName: "Fixture Bio Inc",
  facts: {
    "us-gaap": {
      Revenues: {
        units: {
          USD: [
            usd("2024-01-01", "2024-03-31", 120, "0001588978-24-000008", 2024, "Q1", "10-Q", "2024-05-10"),
          ],
        },
      },
      NetIncomeLoss: {
        units: {
          USD: [
            usd("2024-01-01", "2024-03-31", -8_000, "0001588978-24-000008", 2024, "Q1", "10-Q", "2024-05-10"),
          ],
        },
      },
      NetCashProvidedByUsedInOperatingActivities: {
        units: {
          USD: [
            usd("2024-01-01", "2024-03-31", -6_500, "0001588978-24-000008", 2024, "Q1", "10-Q", "2024-05-10"),
          ],
        },
      },
      CashAndCashEquivalentsAtCarryingValue: {
        units: {
          USD: [instant("2024-03-31", 40_000, "0001588978-24-000008", 2024, "Q1", "10-Q", "2024-05-10")],
        },
      },
    },
  },
};

/** Pre-profit growth: revenue + negative operating income. */
export const FIXTURE_GROWTH_PREPROFIT_COMPANYFACTS: SecCompanyfactsDocument = {
  cik: 1819994,
  entityName: "Fixture Launch Co",
  facts: {
    "us-gaap": {
      RevenueFromContractWithCustomerExcludingAssessedTax: {
        units: {
          USD: [
            usd("2024-04-01", "2024-06-30", 110_000_000, "0001819994-24-000030", 2024, "Q2", "10-Q", "2024-08-08"),
            usd("2023-04-01", "2023-06-30", 62_000_000, "0001819994-23-000030", 2023, "Q2", "10-Q", "2023-08-08"),
          ],
        },
      },
      GrossProfit: {
        units: {
          USD: [
            usd("2024-04-01", "2024-06-30", 28_000_000, "0001819994-24-000030", 2024, "Q2", "10-Q", "2024-08-08"),
          ],
        },
      },
      OperatingIncomeLoss: {
        units: {
          USD: [
            usd("2024-04-01", "2024-06-30", -40_000_000, "0001819994-24-000030", 2024, "Q2", "10-Q", "2024-08-08"),
          ],
        },
      },
      NetIncomeLoss: {
        units: {
          USD: [
            usd("2024-04-01", "2024-06-30", -42_000_000, "0001819994-24-000030", 2024, "Q2", "10-Q", "2024-08-08"),
          ],
        },
      },
      CashAndCashEquivalentsAtCarryingValue: {
        units: {
          USD: [instant("2024-06-30", 400_000_000, "0001819994-24-000030", 2024, "Q2", "10-Q", "2024-08-08")],
        },
      },
      EntityCommonStockSharesOutstanding: {
        units: {
          shares: [instant("2024-06-30", 500_000_000, "0001819994-24-000030", 2024, "Q2", "10-Q", "2024-08-08")],
        },
      },
    },
    dei: {
      EntityCommonStockSharesOutstanding: {
        units: {
          shares: [instant("2024-06-30", 500_000_000, "0001819994-24-000030", 2024, "Q2", "10-Q", "2024-08-08")],
        },
      },
    },
  },
};

/** Small-cap with cash + shares only (financing activity lives in DilutionInstrument). */
export const FIXTURE_SMALLCAP_COMPANYFACTS: SecCompanyfactsDocument = {
  cik: 1401667,
  entityName: "Fixture Micro Inc",
  facts: {
    "us-gaap": {
      Revenues: {
        units: {
          USD: [
            usd("2024-01-01", "2024-03-31", 2_100, "0001401667-24-000004", 2024, "Q1", "10-Q", "2024-05-15"),
          ],
        },
      },
      CashAndCashEquivalentsAtCarryingValue: {
        units: {
          USD: [instant("2024-03-31", 4_400, "0001401667-24-000004", 2024, "Q1", "10-Q", "2024-05-15")],
        },
      },
    },
    dei: {
      EntityCommonStockSharesOutstanding: {
        units: {
          shares: [instant("2024-03-31", 120_000_000, "0001401667-24-000004", 2024, "Q1", "10-Q", "2024-05-15")],
        },
      },
    },
  },
};

/** Non-calendar fiscal year (ends late January). */
export const FIXTURE_FISCAL_OFFSET_COMPANYFACTS: SecCompanyfactsDocument = {
  cik: 104169,
  entityName: "Fixture Retail Inc",
  facts: {
    "us-gaap": {
      RevenueFromContractWithCustomerExcludingAssessedTax: {
        units: {
          USD: [
            usd("2024-11-01", "2025-01-31", 90_000, "0000104169-25-000020", 2025, "Q4", "10-Q", "2025-03-15"),
            usd("2023-11-01", "2024-01-31", 80_000, "0000104169-24-000020", 2024, "Q4", "10-Q", "2024-03-16"),
            usd("2024-02-01", "2025-01-31", 320_000, "0000104169-25-000040", 2025, "FY", "10-K", "2025-03-20"),
          ],
        },
      },
    },
  },
};

/** Same period, original 10-Q then later 10-Q/A — amendment must win. */
export const FIXTURE_AMENDED_COMPANYFACTS: SecCompanyfactsDocument = {
  cik: 789101,
  entityName: "Fixture Amend Co",
  facts: {
    "us-gaap": {
      RevenueFromContractWithCustomerExcludingAssessedTax: {
        units: {
          USD: [
            usd("2024-04-01", "2024-06-30", 10_000, "0000789101-24-000010", 2024, "Q2", "10-Q", "2024-08-01"),
            usd("2024-04-01", "2024-06-30", 11_500, "0000789101-24-000018", 2024, "Q2", "10-Q/A", "2024-08-20"),
          ],
        },
      },
    },
  },
};

export const COMPATIBILITY_SAMPLES = [
  { id: "mega_tech", label: "Mega-cap technology", doc: FIXTURE_TECH_COMPANYFACTS, symbol: "AAPL" },
  { id: "bank", label: "Bank / financial", doc: FIXTURE_BANK_COMPANYFACTS, symbol: "JPM" },
  { id: "saas", label: "SaaS", doc: FIXTURE_SAAS_COMPANYFACTS, symbol: "CRM" },
  { id: "industrial", label: "Industrial / manufacturing", doc: FIXTURE_INDUSTRIAL_COMPANYFACTS, symbol: "CAT" },
  { id: "biotech", label: "Biotech", doc: FIXTURE_BIOTECH_COMPANYFACTS, symbol: "NBIX" },
  { id: "growth", label: "Pre-profit growth", doc: FIXTURE_GROWTH_PREPROFIT_COMPANYFACTS, symbol: "RKLB" },
  { id: "smallcap", label: "Small-cap issuer", doc: FIXTURE_SMALLCAP_COMPANYFACTS, symbol: "SMCI" },
  { id: "fiscal_offset", label: "Non-calendar fiscal year", doc: FIXTURE_FISCAL_OFFSET_COMPANYFACTS, symbol: "WMT" },
  { id: "amended", label: "Amended filing", doc: FIXTURE_AMENDED_COMPANYFACTS, symbol: "AMD" },
  { id: "sparse", label: "Sparse / nonstandard XBRL", doc: FIXTURE_SPARSE_COMPANYFACTS, symbol: "SPAR" },
] as const;
