/**
 * Assemble full Company State report from DB read models.
 */

import { loadMetricObservationsForSymbol } from "../metrics/load.ts";
import { getCapitalRiskReportForSymbol } from "../capital-risk/snapshot.ts";
import { getInsiderReportForSymbol } from "../insider/get-report.ts";
import { getOwnershipReportForSymbol } from "../ownership/get-report.ts";
import { prisma } from "../prisma.ts";
import {
  buildBalanceSheetDimension,
  buildCashDimension,
  buildGrowthDimension,
  buildProfitabilityDimension,
  buildShareStructureDimension,
} from "./from-metrics.ts";
import type { CompanyStateReport, StateDimension } from "./types.ts";
import { COMPANY_STATE_VERSION } from "./types.ts";

function buildCapitalDimension(
  capital: Awaited<ReturnType<typeof getCapitalRiskReportForSymbol>> | null
): StateDimension {
  if (!capital) {
    return {
      id: "capital",
      label: "Capital",
      summary: "Capital risk unavailable",
      trend: "unknown",
      values: [],
      latestObservationDate: null,
      evidence: [],
      status: "unknown",
      unavailableReason: "No capital risk snapshot",
    };
  }
  const r = capital;
  const values = [
    r.liquidity.cash != null
      ? {
          label: "Cash",
          value: r.liquidity.cash,
          unit: "USD",
          periodLabel: null,
          asOf: r.liquidity.cashAsOf,
        }
      : null,
    r.shareStructure.sharesOutstanding != null
      ? {
          label: "Shares outstanding",
          value: r.shareStructure.sharesOutstanding,
          unit: "shares",
          periodLabel: null,
          asOf: r.shareStructure.sharesAsOf,
        }
      : null,
  ].filter(Boolean) as StateDimension["values"];
  const statusLevel = r.status;
  const trend =
    statusLevel === "elevated"
      ? ("deteriorating" as const)
      : statusLevel === "low"
        ? ("stable" as const)
        : statusLevel === "unknown"
          ? ("unknown" as const)
          : ("mixed" as const);
  return {
    id: "capital",
    label: "Capital",
    summary: r.statusLabel || r.summary,
    trend,
    values,
    latestObservationDate: r.asOf,
    evidence: [
      {
        category: "capital_snapshot",
        linkedModel: "capital_risk_snapshot",
        linkedId: r.snapshotId,
        sourceUrl: r.liquidity.cashSourceUrl,
        availability: r.status === "unknown" ? "unknown" : "reported",
      },
    ],
    status: r.status === "unknown" ? "partial" : "ready",
    unavailableReason: null,
  };
}

function buildInsidersDimension(
  insider: Awaited<ReturnType<typeof getInsiderReportForSymbol>> | null
): StateDimension {
  if (!insider || insider.empty) {
    return {
      id: "insiders",
      label: "Insiders",
      summary: "No structured Form 4 activity in stored window",
      trend: "unknown",
      values: [],
      latestObservationDate: null,
      evidence: [],
      status: "unknown",
      unavailableReason: "No insider transactions persisted",
    };
  }
  const openMarket = insider.transactions.filter(
    (t) =>
      t.classification === "open_market_purchase" ||
      t.classification === "open_market_sale"
  );
  const latest = insider.transactions[0];
  return {
    id: "insiders",
    label: "Insiders",
    summary:
      openMarket.length > 0
        ? `${openMarket.length} open-market Form 4 transaction(s) on record`
        : `${insider.transactions.length} Form 4 transaction(s) on record`,
    trend: "unknown",
    values: latest
      ? [
          {
            label: "Latest transaction",
            value: latest.shares,
            unit: "shares",
            periodLabel: latest.transactionDate,
            asOf: latest.filedAt,
          },
        ]
      : [],
    latestObservationDate: latest?.filedAt ?? null,
    evidence: latest
      ? [
          {
            category: "form4",
            linkedModel: "insider_transaction",
            linkedId: latest.id,
            sourceUrl: latest.sourceUrl,
            availability: "reported",
          },
        ]
      : [],
    status: "ready",
    unavailableReason: null,
  };
}

function buildOwnershipDimension(
  ownership: Awaited<ReturnType<typeof getOwnershipReportForSymbol>> | null
): StateDimension {
  if (!ownership || ownership.empty) {
    return {
      id: "ownership",
      label: "Ownership",
      summary: "No structured 13D/G or 13F snapshot in stored window",
      trend: "unknown",
      values: [],
      latestObservationDate: null,
      evidence: [],
      status: "unknown",
      unavailableReason: "No ownership filings persisted",
    };
  }
  const latest13d = ownership.filings[0];
  const has13f = ownership.institutional && !ownership.institutional.empty;
  return {
    id: "ownership",
    label: "Ownership",
    summary: latest13d
      ? `Latest beneficial ownership filing: ${latest13d.formType}`
      : has13f
        ? "Institutional 13F snapshot available (delayed disclosure)"
        : "Ownership data partial",
    trend: "unknown",
    values: latest13d?.percentOwned != null
      ? [
          {
            label: "Beneficial ownership",
            value: latest13d.percentOwned,
            unit: "percent",
            periodLabel: null,
            asOf: latest13d.filedAt,
          },
        ]
      : [],
    latestObservationDate: latest13d?.filedAt ?? ownership.institutional?.asOf ?? null,
    evidence: latest13d
      ? [
          {
            category: "ownership_13d",
            linkedModel: "beneficial_ownership_filing",
            linkedId: latest13d.id,
            sourceUrl: latest13d.sourceUrl,
            availability: "reported",
          },
        ]
      : [],
    status: latest13d || has13f ? "partial" : "unknown",
    unavailableReason: null,
  };
}

async function buildManagementDimension(symbol: string): Promise<StateDimension> {
  const events = await prisma.companyEvent.findMany({
    where: { symbol, category: "management" },
    orderBy: { occurredAt: "desc" },
    take: 3,
    select: {
      id: true,
      title: true,
      occurredAt: true,
      sourceUrl: true,
    },
  });
  if (events.length === 0) {
    return {
      id: "management",
      label: "Management",
      summary: "No management change events in stored window",
      trend: "unknown",
      values: [],
      latestObservationDate: null,
      evidence: [],
      status: "unknown",
      unavailableReason: null,
    };
  }
  return {
    id: "management",
    label: "Management",
    summary: events[0]!.title,
    trend: "unknown",
    values: [],
    latestObservationDate: events[0]!.occurredAt.toISOString(),
    evidence: events.map((e) => ({
      category: "company_event",
      linkedModel: "company_event",
      linkedId: e.id,
      sourceUrl: e.sourceUrl,
      availability: "reported" as const,
    })),
    status: "ready",
    unavailableReason: null,
  };
}

export async function buildCompanyStateReport(
  symbol: string
): Promise<CompanyStateReport> {
  const sym = symbol.trim().toUpperCase();
  const [observations, capital, insider, ownership, master] = await Promise.all([
    loadMetricObservationsForSymbol(sym),
    getCapitalRiskReportForSymbol(sym).catch(() => null),
    getInsiderReportForSymbol(sym, 10).catch(() => null),
    getOwnershipReportForSymbol(sym, 5).catch(() => null),
    prisma.symbolMaster.findUnique({
      where: { symbol: sym },
      select: { cik: true },
    }),
  ]);

  const management = await buildManagementDimension(sym);

  const dimensions: StateDimension[] = [
    buildGrowthDimension(observations),
    buildProfitabilityDimension(observations),
    buildCashDimension(observations),
    buildBalanceSheetDimension(observations),
    buildShareStructureDimension(observations),
    buildCapitalDimension(capital),
    management,
    buildInsidersDimension(insider),
    buildOwnershipDimension(ownership),
  ];

  return {
    symbol: sym,
    cik: master?.cik ?? observations[0]?.cik ?? null,
    version: COMPANY_STATE_VERSION,
    asOf: new Date().toISOString(),
    dimensions,
  };
}
