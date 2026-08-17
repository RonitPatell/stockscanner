/**
 * Pure Portfolio Brief composer — no DB.
 * Useful from SEC/company event + thesis evaluation inputs alone.
 */

import { diffThesisEvaluations } from "./thesis-deltas.ts";
import type {
  BriefEventInput,
  BriefThesisSnapshot,
  PortfolioBriefDto,
  PortfolioBriefItem,
  PortfolioBriefUpcomingItem,
  PortfolioBriefSections,
} from "./types.ts";
import { PORTFOLIO_BRIEF_VERSION } from "./types.ts";

function toItem(e: BriefEventInput): PortfolioBriefItem {
  return {
    id: e.id,
    symbol: e.symbol,
    title: e.title,
    summary: e.summary,
    category: e.category,
    eventType: e.eventType,
    significanceLevel: e.significanceLevel,
    occurredAt: e.occurredAt,
    sourceUrl: e.sourceUrl,
  };
}

function dedupeById(items: PortfolioBriefItem[]): PortfolioBriefItem[] {
  const seen = new Set<string>();
  const out: PortfolioBriefItem[] = [];
  for (const i of items) {
    if (seen.has(i.id)) continue;
    seen.add(i.id);
    out.push(i);
  }
  return out;
}

export function composePortfolioBrief(opts: {
  monitoredSymbols: string[];
  events: BriefEventInput[];
  /** Latest evaluation per thesis */
  thesisLatest: BriefThesisSnapshot[];
  thesisPreviousByThesisId: Map<string, BriefThesisSnapshot>;
  upcoming?: PortfolioBriefUpcomingItem[];
  upcomingFromCalendar?: boolean;
  since: Date;
  until: Date;
  windowDays?: number;
  now?: Date;
}): PortfolioBriefDto {
  const monitored = [
    ...new Set(opts.monitoredSymbols.map((s) => s.trim().toUpperCase()).filter(Boolean)),
  ];
  const emptyPortfolio = monitored.length === 0;
  const since = opts.since;
  const until = opts.until;

  const inWindow = opts.events.filter((e) => {
    const t = new Date(e.occurredAt).getTime();
    return (
      Number.isFinite(t) &&
      t >= since.getTime() &&
      t <= until.getTime() &&
      monitored.includes(e.symbol.toUpperCase())
    );
  });

  const highMed = inWindow.filter((e) => {
    const lvl = (e.significanceLevel ?? "").toUpperCase();
    return lvl === "HIGH" || lvl === "MEDIUM";
  });

  const needsReview = dedupeById(
    highMed
      .slice()
      .sort(
        (a, b) =>
          new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
      )
      .map(toItem)
  ).slice(0, 40);

  const financial = dedupeById(
    highMed.filter((e) => e.category === "financial").map(toItem)
  ).slice(0, 20);

  const capital = dedupeById(
    highMed
      .filter(
        (e) =>
          e.category === "capital" ||
          e.eventType === "capital_risk_level_change"
      )
      .map(toItem)
  ).slice(0, 20);

  const insiders = dedupeById(
    highMed
      .filter((e) => e.category === "insider")
      .map(toItem)
  ).slice(0, 20);

  const ownership = dedupeById(
    highMed.filter((e) => e.category === "ownership").map(toItem)
  ).slice(0, 20);

  const thesisChanges = emptyPortfolio
    ? []
    : diffThesisEvaluations({
        latest: opts.thesisLatest.filter((t) =>
          monitored.includes(t.symbol.toUpperCase())
        ),
        previousByThesisId: opts.thesisPreviousByThesisId,
      }).slice(0, 30);

  const activeSymbols = new Set(
    [...needsReview, ...financial, ...capital, ...insiders, ...ownership].map(
      (i) => i.symbol
    )
  );
  for (const t of thesisChanges) activeSymbols.add(t.symbol);

  const quietCompanies = emptyPortfolio
    ? []
    : monitored.filter((s) => !activeSymbols.has(s)).slice(0, 40);

  const upcoming = (opts.upcoming ?? [])
    .filter((u) => monitored.includes(u.symbol.toUpperCase()))
    .slice(0, 15);

  const sections: PortfolioBriefSections = {
    needsReview,
    thesisChanges,
    financial,
    capital,
    insiders,
    ownership,
    upcoming,
    quietCompanies,
  };

  const headline = buildHeadline({
    emptyPortfolio,
    sections,
    monitoredCount: monitored.length,
  });

  return {
    sections,
    meta: {
      version: PORTFOLIO_BRIEF_VERSION,
      generatedAt: (opts.now ?? new Date()).toISOString(),
      since: since.toISOString(),
      until: until.toISOString(),
      monitoredCount: monitored.length,
      emptyPortfolio,
      upcomingFromCalendar: opts.upcomingFromCalendar === true,
      windowDays: opts.windowDays ?? 7,
    },
    headline,
  };
}

function buildHeadline(opts: {
  emptyPortfolio: boolean;
  sections: PortfolioBriefSections;
  monitoredCount: number;
}): string {
  if (opts.emptyPortfolio) {
    return "Add companies to your portfolio to get a personalized brief.";
  }
  const n =
    opts.sections.needsReview.length +
    opts.sections.thesisChanges.filter((t) => t.isConflict).length;
  if (n === 0) {
    const quiet = opts.sections.quietCompanies.length;
    if (quiet > 0) {
      return `${quiet} of ${opts.monitoredCount} monitored ${opts.monitoredCount === 1 ? "company" : "companies"} had no material TrustTicker event since your previous brief.`;
    }
    return `Nothing material needs review across ${opts.monitoredCount} monitored ${opts.monitoredCount === 1 ? "company" : "companies"}.`;
  }
  return `${n} item${n === 1 ? "" : "s"} across your portfolio deserve attention.`;
}
