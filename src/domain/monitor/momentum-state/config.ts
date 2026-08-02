import type { SessionSegment } from "../market-state/session.ts";
import type { LiquidityCohort, StateThresholds } from "./types.ts";

const BASE_DWELL: StateThresholds["dwellMs"] = {
  DORMANT: 0,
  EMERGING: 1_000,
  BUILDING: 1_500,
  BREAKING: 2_000,
  ACTIVE: 3_000,
  COOLING: 2_000,
  FADING: 2_000,
  RECLAIMING: 1_500,
  HALTED: 0,
  UNKNOWN: 0,
};

function base(): StateThresholds {
  return {
    dormantMax: 12,
    emergingMin: 18,
    buildingMin: 32,
    breakingMin: 48,
    activeMin: 58,
    slopeEmerging: 0.8,
    slopeBuilding: 1.5,
    slopeBreaking: 3.0,
    slopeCooling: -1.2,
    slopeFading: -2.5,
    participationEmerging: 15,
    participationBuilding: 30,
    participationActive: 45,
    staleMs: 15_000,
    intensityHysteresis: 4,
    dwellMs: { ...BASE_DWELL },
  };
}

/** Session adjustments (multipliers / additive). */
function applySession(t: StateThresholds, session: SessionSegment): StateThresholds {
  const out = { ...t, dwellMs: { ...t.dwellMs } };
  switch (session) {
    case "open_auction":
      // Noisier open — higher bars, longer dwell on BREAKING/ACTIVE.
      out.emergingMin += 4;
      out.buildingMin += 5;
      out.breakingMin += 6;
      out.activeMin += 6;
      out.dwellMs.BREAKING = (out.dwellMs.BREAKING ?? 2000) + 1000;
      out.dwellMs.ACTIVE = (out.dwellMs.ACTIVE ?? 3000) + 1000;
      out.staleMs = 8_000;
      break;
    case "premarket":
    case "after_hours":
      out.participationEmerging -= 5;
      out.participationBuilding -= 8;
      out.staleMs = 25_000;
      break;
    case "closed":
      out.staleMs = 60_000;
      out.emergingMin += 10;
      break;
    default:
      break;
  }
  return out;
}

/** Liquidity cohort: thin books need more participation confirmation. */
function applyLiquidity(
  t: StateThresholds,
  cohort: LiquidityCohort
): StateThresholds {
  const out = { ...t, dwellMs: { ...t.dwellMs } };
  switch (cohort) {
    case "ultra_thin":
      out.participationEmerging += 10;
      out.participationBuilding += 15;
      out.participationActive += 15;
      out.intensityHysteresis += 3;
      out.dwellMs.EMERGING = (out.dwellMs.EMERGING ?? 1000) + 1000;
      out.dwellMs.BREAKING = (out.dwellMs.BREAKING ?? 2000) + 1500;
      break;
    case "thin":
      out.participationBuilding += 8;
      out.participationActive += 10;
      out.intensityHysteresis += 2;
      break;
    case "liquid":
      out.participationEmerging -= 3;
      out.breakingMin -= 2;
      break;
    default:
      break;
  }
  return out;
}

export function resolveThresholds(
  session: SessionSegment,
  liquidityCohort: LiquidityCohort
): StateThresholds {
  return applyLiquidity(applySession(base(), session), liquidityCohort);
}
