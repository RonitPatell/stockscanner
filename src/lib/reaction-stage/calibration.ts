import { prisma } from "../prisma.ts";
import { REACTION_STAGE_ENGINE_VERSION } from "./version.ts";

export interface ReactionStageCalibrationReport {
  engineVersion: string;
  hours: number;
  sampleSize: number;
  missingDataRate: number | null;
  outcomeByStartingStage: Record<
    string,
    { n: number; avgRawReturnPct: number | null; avgMfePct: number | null }
  >;
  transitions: Array<{ from: string; to: string; count: number }>;
  falseStale: { n: number; rate: number | null; note: string };
  falseEarly: { n: number; rate: number | null; note: string };
  disclaimer: string;
}

/**
 * Admin calibration — distributional only, not P&L advice.
 * False stale/early heuristics use later outcomes when available.
 */
export async function getReactionStageCalibrationReport(
  hours = 168
): Promise<ReactionStageCalibrationReport> {
  const since = new Date(Date.now() - hours * 3600_000);

  const snapshots = await prisma.reactionStageSnapshot.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      catalystId: true,
      stage: true,
      previousStage: true,
      metricsJson: true,
      createdAt: true,
    },
    take: 10_000,
  });

  const transitions = await prisma.reactionStageTransition.groupBy({
    by: ["fromStage", "toStage"],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
  });

  // First snapshot per catalyst = starting state
  const firstByCatalyst = new Map<string, (typeof snapshots)[0]>();
  for (const s of snapshots) {
    if (!firstByCatalyst.has(s.catalystId)) firstByCatalyst.set(s.catalystId, s);
  }

  const catalystIds = [...firstByCatalyst.keys()];
  const outcomes =
    catalystIds.length > 0
      ? await prisma.catalystOutcome.findMany({
          where: { catalystId: { in: catalystIds } },
          select: {
            catalystId: true,
            rawReturnPct: true,
            mfePct: true,
            dataComplete: true,
          },
        })
      : [];
  const outcomeById = new Map(outcomes.map((o) => [o.catalystId, o]));

  const byStage: ReactionStageCalibrationReport["outcomeByStartingStage"] = {};
  for (const [cid, snap] of firstByCatalyst) {
    const stage = snap.stage;
    if (!byStage[stage]) {
      byStage[stage] = { n: 0, avgRawReturnPct: null, avgMfePct: null };
    }
    byStage[stage].n += 1;
    const o = outcomeById.get(cid);
    if (o?.rawReturnPct != null) {
      const cur = byStage[stage];
      const prevN = (cur.avgRawReturnPct == null ? 0 : 1) + (cur.n - 1);
      // accumulate then finalize
      (cur as { _sumRaw?: number; _sumMfe?: number; _nOut?: number })._sumRaw =
        ((cur as { _sumRaw?: number })._sumRaw ?? 0) + o.rawReturnPct;
      (cur as { _sumMfe?: number })._sumMfe =
        ((cur as { _sumMfe?: number })._sumMfe ?? 0) + (o.mfePct ?? 0);
      (cur as { _nOut?: number })._nOut =
        ((cur as { _nOut?: number })._nOut ?? 0) + 1;
      void prevN;
    }
  }
  for (const v of Object.values(byStage)) {
    const ext = v as {
      _sumRaw?: number;
      _sumMfe?: number;
      _nOut?: number;
    };
    if (ext._nOut && ext._nOut > 0) {
      v.avgRawReturnPct = (ext._sumRaw ?? 0) / ext._nOut;
      v.avgMfePct = (ext._sumMfe ?? 0) / ext._nOut;
    }
    delete ext._sumRaw;
    delete ext._sumMfe;
    delete ext._nOut;
  }

  // Missing-data: UNKNOWN stage or metrics flag
  let missing = 0;
  for (const s of snapshots) {
    if (s.stage === "UNKNOWN") {
      missing++;
      continue;
    }
    const m = s.metricsJson as { currentPrice?: { availability?: string } } | null;
    if (m?.currentPrice?.availability === "unavailable") missing++;
  }
  const sampleSize = snapshots.length;
  const missingDataRate = sampleSize > 0 ? missing / sampleSize : null;

  // False STALE: started STALE but later MFE >= 8% (heuristic audit flag)
  let falseStaleN = 0;
  let staleStarts = 0;
  let falseEarlyN = 0;
  let earlyStarts = 0;
  for (const [cid, snap] of firstByCatalyst) {
    const o = outcomeById.get(cid);
    if (snap.stage === "STALE") {
      staleStarts++;
      if (o?.mfePct != null && o.mfePct >= 8) falseStaleN++;
    }
    if (snap.stage === "EARLY") {
      earlyStarts++;
      // False early: large move already happened before (stored in metrics) OR tiny MFE
      const m = snap.metricsJson as {
        pctMoveBeforePublication?: { value?: number | null };
      } | null;
      const pre = Math.abs(m?.pctMoveBeforePublication?.value ?? 0);
      if (pre >= 5 || (o?.mfePct != null && o.mfePct < 1 && o.dataComplete)) {
        falseEarlyN++;
      }
    }
  }

  return {
    engineVersion: REACTION_STAGE_ENGINE_VERSION,
    hours,
    sampleSize,
    missingDataRate,
    outcomeByStartingStage: byStage,
    transitions: transitions.map((t) => ({
      from: t.fromStage,
      to: t.toStage,
      count: t._count._all,
    })),
    falseStale: {
      n: falseStaleN,
      rate: staleStarts > 0 ? falseStaleN / staleStarts : null,
      note: "Heuristic: starting STALE with later MFE ≥ 8%. Audit flag only — not a model score.",
    },
    falseEarly: {
      n: falseEarlyN,
      rate: earlyStarts > 0 ? falseEarlyN / earlyStarts : null,
      note: "Heuristic: EARLY with ≥5% pre-publish move or completed tiny MFE. Audit flag only.",
    },
    disclaimer:
      "Calibration is observational. Not a profit model. Do not claim accuracy without adequate samples.",
  };
}
