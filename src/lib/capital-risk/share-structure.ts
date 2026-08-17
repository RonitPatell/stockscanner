/**
 * Share structure: outstanding shares + YoY / multi-year change.
 */

import type { CapitalShareStructureBlock } from "./types.ts";

export type ShareObservation = {
  metricKey: string;
  value: number | null;
  periodEnd: Date | null;
  fiscalYear: number | null;
  fiscalPeriod: string | null;
  sourceUrl: string | null;
  fingerprint: string;
};

function pickShares(rows: ShareObservation[]): ShareObservation[] {
  const outstanding = rows.filter(
    (r) => r.metricKey === "shares_outstanding" && r.value != null
  );
  if (outstanding.length) return outstanding;
  return rows.filter(
    (r) => r.metricKey === "diluted_shares" && r.value != null
  );
}

function pctChange(curr: number, prior: number): number | null {
  if (prior === 0) return null;
  const p = ((curr - prior) / Math.abs(prior)) * 100;
  return Number.isFinite(p) ? p : null;
}

export function buildShareStructureBlock(
  observations: ShareObservation[]
): CapitalShareStructureBlock {
  const pool = pickShares(observations).sort(
    (a, b) => (b.periodEnd?.getTime() ?? 0) - (a.periodEnd?.getTime() ?? 0)
  );
  const current = pool[0] ?? null;
  if (!current || current.value == null) {
    return {
      sharesOutstanding: null,
      sharesAsOf: null,
      sharesSourceUrl: null,
      yoyChangePercent: null,
      multiYearChangePercent: null,
      multiYearYears: null,
      explanation: "Shares outstanding observation is unavailable.",
    };
  }

  let yoy: number | null = null;
  if (current.fiscalYear != null && current.fiscalPeriod) {
    const prior = pool.find(
      (p) =>
        p.fingerprint !== current.fingerprint &&
        p.value != null &&
        p.fiscalYear === current.fiscalYear! - 1 &&
        p.fiscalPeriod === current.fiscalPeriod
    );
    if (prior?.value != null) {
      yoy = pctChange(current.value, prior.value);
    }
  }
  if (yoy == null && current.periodEnd) {
    const target = current.periodEnd.getTime() - 365 * 86_400_000;
    let best: ShareObservation | null = null;
    let bestDist = Infinity;
    for (const p of pool) {
      if (!p.periodEnd || p.fingerprint === current.fingerprint || p.value == null)
        continue;
      const dist = Math.abs(p.periodEnd.getTime() - target);
      if (dist < bestDist && dist <= 60 * 86_400_000) {
        best = p;
        bestDist = dist;
      }
    }
    if (best?.value != null) yoy = pctChange(current.value, best.value);
  }

  let multiYear: number | null = null;
  let multiYearYears: number | null = null;
  if (current.periodEnd) {
    const older = pool.filter((p) => {
      if (!p.periodEnd || p.value == null) return false;
      const years =
        (current.periodEnd!.getTime() - p.periodEnd.getTime()) /
        (365.25 * 86_400_000);
      return years >= 2.5 && years <= 4.5;
    });
    older.sort(
      (a, b) =>
        Math.abs(
          (current.periodEnd!.getTime() - (a.periodEnd?.getTime() ?? 0)) -
            3 * 365.25 * 86_400_000
        ) -
        Math.abs(
          (current.periodEnd!.getTime() - (b.periodEnd?.getTime() ?? 0)) -
            3 * 365.25 * 86_400_000
        )
    );
    const hit = older[0];
    if (hit?.value != null && hit.periodEnd) {
      multiYear = pctChange(current.value, hit.value);
      multiYearYears =
        Math.round(
          ((current.periodEnd.getTime() - hit.periodEnd.getTime()) /
            (365.25 * 86_400_000)) *
            10
        ) / 10;
    }
  }

  const parts: string[] = [];
  if (yoy != null) parts.push(`YoY share-count change ${yoy.toFixed(1)}%`);
  else parts.push("YoY share-count change unavailable");
  if (multiYear != null && multiYearYears != null) {
    parts.push(
      `~${multiYearYears}y change ${multiYear.toFixed(1)}%`
    );
  }

  return {
    sharesOutstanding: current.value,
    sharesAsOf: current.periodEnd?.toISOString() ?? null,
    sharesSourceUrl: current.sourceUrl,
    yoyChangePercent: yoy,
    multiYearChangePercent: multiYear,
    multiYearYears,
    explanation: parts.join(". ") + ".",
  };
}
