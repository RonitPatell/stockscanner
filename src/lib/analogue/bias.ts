/**
 * Admin helpers — detect survivorship and selection bias in the analogue corpus.
 * Descriptive diagnostics only; does not rewrite outcomes.
 */

export interface BiasCorpusRow {
  catalystId: string;
  symbol: string;
  ingestedAt: string;
  category: string | null;
  delistedOrChanged: boolean;
  eligibleUrgent: boolean;
  excludeReason: string | null;
  dataComplete: boolean;
  hasOutcome: boolean;
  classificationVersion: string | null;
  marketSession: string | null;
  sourceTier: string | null;
}

export interface BiasReport {
  generatedAt: string;
  corpusSize: number;
  withOutcome: number;
  outcomeCoverage: number | null;
  delistedOrChangedCount: number;
  delistedShare: number | null;
  /** Higher delisted share among older cohorts → possible survivorship skew */
  survivorshipFlags: string[];
  selectionFlags: string[];
  byClassificationVersion: Array<{
    version: string;
    n: number;
    withOutcome: number;
  }>;
  bySession: Array<{ session: string; n: number; withOutcome: number }>;
  excludedReasons: Array<{ reason: string; n: number }>;
  disclaimer: string;
}

export function detectAnalogueBias(rows: BiasCorpusRow[]): BiasReport {
  const generatedAt = new Date().toISOString();
  const corpusSize = rows.length;
  const withOutcome = rows.filter((r) => r.hasOutcome && r.dataComplete).length;
  const delistedOrChangedCount = rows.filter((r) => r.delistedOrChanged).length;
  const outcomeCoverage =
    corpusSize > 0 ? Math.round((withOutcome / corpusSize) * 1000) / 1000 : null;
  const delistedShare =
    corpusSize > 0
      ? Math.round((delistedOrChangedCount / corpusSize) * 1000) / 1000
      : null;

  const survivorshipFlags: string[] = [];
  const selectionFlags: string[] = [];

  // Age split: older half vs newer half delisted share
  const sorted = [...rows].sort(
    (a, b) => Date.parse(a.ingestedAt) - Date.parse(b.ingestedAt)
  );
  if (sorted.length >= 20) {
    const mid = Math.floor(sorted.length / 2);
    const older = sorted.slice(0, mid);
    const newer = sorted.slice(mid);
    const olderDel =
      older.filter((r) => r.delistedOrChanged).length / Math.max(1, older.length);
    const newerDel =
      newer.filter((r) => r.delistedOrChanged).length / Math.max(1, newer.length);
    if (olderDel + 0.05 < newerDel) {
      survivorshipFlags.push(
        `Newer cohort shows higher delist/change rate (${(newerDel * 100).toFixed(1)}% vs ${(olderDel * 100).toFixed(1)}% older) — check that failed names remain in the corpus.`
      );
    }
    if (olderDel > 0.15 && newerDel < 0.03) {
      survivorshipFlags.push(
        "Older cohort has many delisted/changed symbols while newer does not — survivors may dominate long-lookback analogues."
      );
    }
  }

  if (outcomeCoverage != null && outcomeCoverage < 0.5) {
    selectionFlags.push(
      `Outcome coverage ${(outcomeCoverage * 100).toFixed(0)}% — incomplete backfills can bias toward liquid names with candle data.`
    );
  }

  const afterHours = rows.filter((r) => r.marketSession === "afterhours");
  const ahComplete = afterHours.filter((r) => r.hasOutcome && r.dataComplete);
  if (afterHours.length >= 10) {
    const rate = ahComplete.length / afterHours.length;
    if (rate < 0.4) {
      selectionFlags.push(
        `After-hours events have low complete-outcome rate (${(rate * 100).toFixed(0)}%) — AH analogues may under-represent thin sessions.`
      );
    }
  }

  const wire = rows.filter((r) => r.sourceTier === "wire");
  const blog = rows.filter(
    (r) => r.sourceTier === "blog" || r.sourceTier === "aggregator"
  );
  if (wire.length > 50 && blog.length > 20) {
    const wireOut =
      wire.filter((r) => r.hasOutcome).length / Math.max(1, wire.length);
    const blogOut =
      blog.filter((r) => r.hasOutcome).length / Math.max(1, blog.length);
    if (wireOut > blogOut + 0.2) {
      selectionFlags.push(
        "Wire-tier events have denser outcomes than aggregator/blog — source-tier mix can skew analogue liquidity."
      );
    }
  }

  const versions = new Map<string, { n: number; withOutcome: number }>();
  for (const r of rows) {
    const v = r.classificationVersion ?? "unversioned";
    const cur = versions.get(v) ?? { n: 0, withOutcome: 0 };
    cur.n++;
    if (r.hasOutcome) cur.withOutcome++;
    versions.set(v, cur);
  }
  if (versions.size > 1) {
    selectionFlags.push(
      `Multiple classification versions in corpus (${[...versions.keys()].join(", ")}). Matching uses event-time labels; mixing eras can change category density.`
    );
  }

  const sessions = new Map<string, { n: number; withOutcome: number }>();
  for (const r of rows) {
    const s = r.marketSession ?? "unknown";
    const cur = sessions.get(s) ?? { n: 0, withOutcome: 0 };
    cur.n++;
    if (r.hasOutcome) cur.withOutcome++;
    sessions.set(s, cur);
  }

  const reasons = new Map<string, number>();
  for (const r of rows) {
    if (!r.excludeReason) continue;
    reasons.set(r.excludeReason, (reasons.get(r.excludeReason) ?? 0) + 1);
  }

  return {
    generatedAt,
    corpusSize,
    withOutcome,
    outcomeCoverage,
    delistedOrChangedCount,
    delistedShare,
    survivorshipFlags,
    selectionFlags,
    byClassificationVersion: [...versions.entries()].map(([version, v]) => ({
      version,
      ...v,
    })),
    bySession: [...sessions.entries()].map(([session, v]) => ({
      session,
      ...v,
    })),
    excludedReasons: [...reasons.entries()]
      .map(([reason, n]) => ({ reason, n }))
      .sort((a, b) => b.n - a.n),
    disclaimer:
      "Bias diagnostics describe corpus composition. They do not correct prices or invent missing delisted history.",
  };
}
