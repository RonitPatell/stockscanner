/**
 * us-gaap / dei concept aliases → normalized FinancialMetricKey.
 * Prefer canonical concepts first; later entries are fallbacks.
 * Never invent values when no reliable concept matches.
 */

import type { FinancialMetricKey, MetricFactKind } from "./types.ts";

export type ConceptAlias = {
  taxonomy: "us-gaap" | "dei";
  concept: string;
  kind: MetricFactKind;
  /**
   * Prefer these unit keys in order (companyfacts `units` object keys).
   * Empty → accept first numeric unit found with preference USD / shares.
   */
  preferredUnits?: string[];
  /** CapEx and similar often reported as positive outflows. */
  treatAsOutflowMagnitude?: boolean;
};

export type MetricConceptSpec = {
  key: FinancialMetricKey;
  kind: MetricFactKind;
  aliases: ConceptAlias[];
  /** When true, prefer pure USD (not USD/shares). */
  preferPureUsd?: boolean;
};

/**
 * Ordered alias lists. First match with a usable point wins for a period.
 */
export const METRIC_CONCEPT_SPECS: MetricConceptSpec[] = [
  {
    key: "revenue",
    kind: "duration",
    preferPureUsd: true,
    aliases: [
      {
        taxonomy: "us-gaap",
        concept: "RevenueFromContractWithCustomerExcludingAssessedTax",
        kind: "duration",
        preferredUnits: ["USD"],
      },
      {
        taxonomy: "us-gaap",
        concept: "SalesRevenueNet",
        kind: "duration",
        preferredUnits: ["USD"],
      },
      {
        taxonomy: "us-gaap",
        concept: "Revenues",
        kind: "duration",
        preferredUnits: ["USD"],
      },
      {
        taxonomy: "us-gaap",
        concept: "RevenueFromContractWithCustomerIncludingAssessedTax",
        kind: "duration",
        preferredUnits: ["USD"],
      },
      {
        taxonomy: "us-gaap",
        concept: "SalesRevenueGoodsNet",
        kind: "duration",
        preferredUnits: ["USD"],
      },
    ],
  },
  {
    key: "gross_profit",
    kind: "duration",
    preferPureUsd: true,
    aliases: [
      {
        taxonomy: "us-gaap",
        concept: "GrossProfit",
        kind: "duration",
        preferredUnits: ["USD"],
      },
    ],
  },
  {
    key: "operating_income",
    kind: "duration",
    preferPureUsd: true,
    aliases: [
      {
        taxonomy: "us-gaap",
        concept: "OperatingIncomeLoss",
        kind: "duration",
        preferredUnits: ["USD"],
      },
    ],
  },
  {
    key: "net_income",
    kind: "duration",
    preferPureUsd: true,
    aliases: [
      {
        taxonomy: "us-gaap",
        concept: "NetIncomeLoss",
        kind: "duration",
        preferredUnits: ["USD"],
      },
      {
        taxonomy: "us-gaap",
        concept: "ProfitLoss",
        kind: "duration",
        preferredUnits: ["USD"],
      },
    ],
  },
  {
    key: "operating_cash_flow",
    kind: "duration",
    preferPureUsd: true,
    aliases: [
      {
        taxonomy: "us-gaap",
        concept: "NetCashProvidedByUsedInOperatingActivities",
        kind: "duration",
        preferredUnits: ["USD"],
      },
      {
        taxonomy: "us-gaap",
        concept:
          "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
        kind: "duration",
        preferredUnits: ["USD"],
      },
    ],
  },
  {
    key: "capital_expenditures",
    kind: "duration",
    preferPureUsd: true,
    aliases: [
      {
        taxonomy: "us-gaap",
        concept: "PaymentsToAcquirePropertyPlantAndEquipment",
        kind: "duration",
        preferredUnits: ["USD"],
        treatAsOutflowMagnitude: true,
      },
      {
        taxonomy: "us-gaap",
        concept: "PaymentsToAcquireProductiveAssets",
        kind: "duration",
        preferredUnits: ["USD"],
        treatAsOutflowMagnitude: true,
      },
    ],
  },
  {
    key: "cash",
    kind: "instant",
    preferPureUsd: true,
    aliases: [
      {
        taxonomy: "us-gaap",
        concept: "CashAndCashEquivalentsAtCarryingValue",
        kind: "instant",
        preferredUnits: ["USD"],
      },
      {
        taxonomy: "us-gaap",
        concept: "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
        kind: "instant",
        preferredUnits: ["USD"],
      },
      {
        taxonomy: "us-gaap",
        concept: "Cash",
        kind: "instant",
        preferredUnits: ["USD"],
      },
    ],
  },
  {
    key: "total_debt",
    kind: "instant",
    preferPureUsd: true,
    aliases: [
      {
        taxonomy: "us-gaap",
        concept: "LongTermDebt",
        kind: "instant",
        preferredUnits: ["USD"],
      },
      {
        taxonomy: "us-gaap",
        concept: "LongTermDebtNoncurrent",
        kind: "instant",
        preferredUnits: ["USD"],
      },
      {
        taxonomy: "us-gaap",
        concept: "DebtCurrent",
        kind: "instant",
        preferredUnits: ["USD"],
      },
    ],
  },
  {
    key: "diluted_shares",
    kind: "duration",
    aliases: [
      {
        taxonomy: "us-gaap",
        concept: "WeightedAverageNumberOfDilutedSharesOutstanding",
        kind: "duration",
        preferredUnits: ["shares"],
      },
      {
        taxonomy: "us-gaap",
        concept:
          "WeightedAverageNumberOfDilutedSharesOutstandingEmployeeShareBasedCompensation",
        kind: "duration",
        preferredUnits: ["shares"],
      },
    ],
  },
  {
    key: "shares_outstanding",
    kind: "instant",
    aliases: [
      {
        taxonomy: "dei",
        concept: "EntityCommonStockSharesOutstanding",
        kind: "instant",
        preferredUnits: ["shares"],
      },
      {
        taxonomy: "us-gaap",
        concept: "CommonStockSharesOutstanding",
        kind: "instant",
        preferredUnits: ["shares"],
      },
    ],
  },
  {
    key: "eps_diluted",
    kind: "duration",
    aliases: [
      {
        taxonomy: "us-gaap",
        concept: "EarningsPerShareDiluted",
        kind: "duration",
        preferredUnits: ["USD/shares", "pure"],
      },
    ],
  },
];

/** Specs that are extracted from XBRL (not purely derived). */
export const EXTRACTABLE_METRIC_KEYS: FinancialMetricKey[] =
  METRIC_CONCEPT_SPECS.map((s) => s.key);

export function findConceptSpec(
  key: FinancialMetricKey
): MetricConceptSpec | undefined {
  return METRIC_CONCEPT_SPECS.find((s) => s.key === key);
}
