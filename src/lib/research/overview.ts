/**
 * Compose Research Overview from existing ticker loaders.
 * Thesis note/premise never included — health label only when entitled + owned.
 */

import { getTickerHubBundle } from "../ticker-hub.ts";
import { getCapitalRiskReportForSymbol } from "../capital-risk/snapshot.ts";
import { getInsiderReportForSymbol } from "../insider/get-report.ts";
import { getOwnershipReportForSymbol } from "../ownership/get-report.ts";
import { getFilingsReportForSymbol } from "../filings/get-report.ts";
import { getQuarterlyDeltaForSymbol } from "../metrics/get-quarterly-delta.ts";
import {
  getCompanyWhatChangedFeed,
  type WhatChangedAccessMode,
} from "../ticker-what-changed/index.ts";
import { listPortfolioForUser } from "../portfolio/service.ts";
import { getThesisBySymbolForUser } from "../thesis/service.ts";
import { formatHealthSummaryLine } from "../thesis/labels.ts";
import type { ResearchOverviewDto } from "./types.ts";
import { RESEARCH_OVERVIEW_VERSION } from "./types.ts";

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export async function buildResearchOverview(opts: {
  symbol: string;
  accessMode: WhatChangedAccessMode;
  userId: string | null;
}): Promise<ResearchOverviewDto> {
  const symbol = opts.symbol.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5);
  const entitled = opts.accessMode === "entitled" && Boolean(opts.userId);

  const [
    hub,
    capital,
    insider,
    ownership,
    filings,
    delta,
    whatChanged,
  ] = await Promise.all([
    getTickerHubBundle(symbol).catch(() => null),
    getCapitalRiskReportForSymbol(symbol).catch(() => null),
    getInsiderReportForSymbol(symbol, 5).catch(() => null),
    getOwnershipReportForSymbol(symbol, 5).catch(() => null),
    getFilingsReportForSymbol(symbol, 5).catch(() => null),
    getQuarterlyDeltaForSymbol(symbol).catch(() => null),
    getCompanyWhatChangedFeed({
      symbol,
      window: "30d",
      showAllActivity: false,
      accessMode: entitled ? "entitled" : "public",
      userId: entitled ? opts.userId : null,
    }).catch(() => null),
  ]);

  // Strip any thesis relevance from public path (defense in depth)
  if (whatChanged && !entitled) {
    for (const c of whatChanged.cards) c.thesisRelevance = null;
    whatChanged.meta.hasThesis = false;
    whatChanged.meta.accessMode = "public";
  }

  let monitoring: ResearchOverviewDto["monitoring"] = null;
  let thesis: ResearchOverviewDto["thesis"] = null;

  if (entitled && opts.userId) {
    const [portfolio, thesisDto] = await Promise.all([
      listPortfolioForUser(opts.userId).catch(() => []),
      getThesisBySymbolForUser(opts.userId, symbol).catch(() => null),
    ]);
    const item = portfolio.find((p) => p.symbol === symbol) ?? null;
    monitoring = {
      inPortfolio: Boolean(item),
      monitoredSince: item?.monitoredSince ?? null,
      label: item?.label ?? null,
    };
    if (thesisDto) {
      thesis = {
        healthStatus: thesisDto.healthStatus,
        summaryLine: thesisDto.healthSummary
          ? formatHealthSummaryLine(thesisDto.healthSummary)
          : null,
        hasThesis: true,
      };
    } else {
      thesis = {
        healthStatus: "unknown",
        summaryLine: null,
        hasThesis: false,
      };
    }
  }

  const latestEvents =
    whatChanged?.cards.slice(0, 5).map((c) => ({
      id: c.id,
      title: c.whatHappened,
      when: c.when,
      whenLabel: c.whenLabel || fmtWhen(c.when),
      category: c.category,
      significance: c.significance?.level ?? null,
    })) ?? [];

  const materialRow =
    delta?.rows.find(
      (r) =>
        r.emphasis === "material_higher" || r.emphasis === "material_lower"
    ) ??
    delta?.rows.find(
      (r) => r.emphasis === "higher" || r.emphasis === "lower"
    ) ??
    null;

  const tx = insider?.transactions[0] ?? null;
  const own = ownership?.filings[0] ?? null;
  const filingSection = filings?.sections[0] ?? null;
  const hubFiling = hub?.filings[0] ?? null;

  return {
    symbol,
    identity: {
      edgarSearchUrl:
        hub?.edgarSearchUrl ??
        `https://www.sec.gov/edgar/search/#/entityName=${encodeURIComponent(symbol)}`,
      capitalRiskActive: Boolean(hub?.dilution.active),
      capitalRiskHint: hub?.dilution.latestWhy ?? null,
    },
    monitoring,
    latestEvents,
    thesis,
    financialDelta: materialRow
      ? {
          metricLabel: materialRow.label,
          changeLabel: materialRow.changeLabel,
          emphasis: materialRow.emphasis,
          periodLabel: materialRow.basisLabel || null,
        }
      : null,
    capitalRisk: capital
      ? {
          status: capital.status,
          summary: capital.summary ?? null,
        }
      : null,
    latestInsider: tx
      ? {
          summary:
            tx.summaryText ||
            `${tx.ownerName} · ${tx.classificationLabel}`,
          filedAt: tx.filedAt,
          classification: tx.classification,
        }
      : null,
    latestOwnership: own
      ? {
          summary:
            own.summaryText ||
            `${own.filerName} · ${own.formType}${
              own.percentOwned != null
                ? ` · ${own.percentOwned.toFixed(1)}%`
                : ""
            }`,
          filedAt: own.filedAt,
          formType: own.formType,
        }
      : null,
    latestFiling: filingSection
      ? {
          title: `${filingSection.sectionTitle} (${filingSection.formType})`,
          formHint: filingSection.formType,
          when: filingSection.filingDate,
          sourceUrl: filingSection.currentSourceUrl,
        }
      : hubFiling
        ? {
            title: hubFiling.headline,
            formHint: hubFiling.formHint,
            when: hubFiling.publishedAt.toISOString(),
            sourceUrl: hubFiling.sourceUrl,
          }
        : null,
    meta: {
      version: RESEARCH_OVERVIEW_VERSION,
      accessMode: entitled ? "entitled" : "public",
      evaluatedAt: new Date().toISOString(),
    },
  };
}
