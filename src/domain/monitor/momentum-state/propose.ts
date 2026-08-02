import type { StateThresholds } from "./types.ts";
import type {
  MomentumLifecycleState,
  MomentumStateInput,
  TransitionEvidence,
} from "./types.ts";

export interface ProposeResult {
  state: MomentumLifecycleState;
  evidence: TransitionEvidence[];
}

/**
 * Pure proposal from current observables + current state (for hysteresis exits).
 * Does not apply dwell or transition matrix — machine does that next.
 */
export function proposeState(
  input: MomentumStateInput,
  thresholds: StateThresholds,
  current: MomentumLifecycleState | null,
  slope: number
): ProposeResult {
  const evidence: TransitionEvidence[] = [];
  const intensity = input.momentumIntensity;
  const part = input.participationScore ?? 0;
  const accel = input.priceAcceleration ?? 0;
  const dir = input.priceDirection;

  evidence.push({
    code: "momentum_intensity",
    detail: "Momentum intensity level",
    value: intensity,
  });
  evidence.push({
    code: "momentum_intensity_slope",
    detail: "Momentum intensity slope (pts/sec)",
    value: round3(slope),
  });
  evidence.push({
    code: "price_direction",
    detail: "Price direction",
    value: dir,
  });
  evidence.push({
    code: "price_acceleration",
    detail: "Price acceleration",
    value: accel,
  });
  evidence.push({
    code: "participation",
    detail: "Volume/trade-rate participation",
    value: part,
  });
  evidence.push({
    code: "hod_lod",
    detail: "HOD/LOD interaction",
    value: input.hodLodInteraction,
  });
  evidence.push({
    code: "reaction_stage",
    detail: "Reaction stage",
    value: input.reactionStage,
  });

  // Overrides handled by caller (halt / stale) — here only calculated path.
  if (intensity == null || !Number.isFinite(intensity)) {
    return {
      state: "UNKNOWN",
      evidence: [
        ...evidence,
        {
          code: "missing_intensity",
          detail: "Momentum intensity unavailable",
        },
      ],
    };
  }

  const h = thresholds.intensityHysteresis;
  const nearExtreme =
    input.hodLodInteraction === "near_hod" ||
    input.hodLodInteraction === "near_lod";
  const directed =
    dir === "up" || dir === "down" || dir === "neutral";

  // --- Exit-aware bands (hysteresis) ---
  const enterEmerging = intensity >= thresholds.emergingMin && slope >= thresholds.slopeEmerging * 0.5;
  const enterBuilding =
    intensity >= thresholds.buildingMin &&
    slope >= thresholds.slopeBuilding * 0.5 &&
    part >= thresholds.participationBuilding * 0.7;
  const enterBreaking =
    intensity >= thresholds.breakingMin &&
    (slope >= thresholds.slopeBreaking * 0.6 || (nearExtreme && slope > 0)) &&
    part >= thresholds.participationBuilding &&
    directed &&
    (Math.abs(accel) > 0 || slope >= thresholds.slopeBreaking * 0.8);
  const enterActive =
    intensity >= thresholds.activeMin &&
    part >= thresholds.participationActive &&
    slope > thresholds.slopeCooling * 0.5 && // not strongly cooling
    (input.reactionStage === "initial" ||
      input.reactionStage === "developing" ||
      input.reactionStage === "extended" ||
      nearExtreme);

  const coolingSignal =
    slope <= thresholds.slopeCooling ||
    (intensity < thresholds.activeMin - h && slope < 0);
  const fadingSignal =
    slope <= thresholds.slopeFading ||
    (intensity <= thresholds.emergingMin && slope < 0);
  const reclaimSignal =
    slope >= thresholds.slopeBuilding * 0.4 &&
    intensity >= thresholds.buildingMin - h &&
    part >= thresholds.participationEmerging;

  // State-conditioned proposal (hysteresis: harder to leave than enter).
  if (current === "ACTIVE") {
    if (coolingSignal || intensity < thresholds.activeMin - h) {
      return done("COOLING", evidence, "active_cooling_signal");
    }
    if (enterBreaking && slope >= thresholds.slopeBreaking) {
      return done("BREAKING", evidence, "active_reacceleration");
    }
    return done("ACTIVE", evidence, "active_hold");
  }

  if (current === "BREAKING") {
    if (enterActive && intensity >= thresholds.activeMin - h / 2) {
      return done("ACTIVE", evidence, "breaking_to_active");
    }
    if (coolingSignal && intensity < thresholds.breakingMin - h) {
      return done("COOLING", evidence, "breaking_failed_cool");
    }
    if (
      intensity < thresholds.breakingMin - h &&
      slope < thresholds.slopeBuilding
    ) {
      return done("BUILDING", evidence, "breaking_backoff");
    }
    return done("BREAKING", evidence, "breaking_hold");
  }

  if (current === "BUILDING") {
    if (enterBreaking) {
      return done("BREAKING", evidence, "building_to_breaking");
    }
    if (coolingSignal && intensity < thresholds.buildingMin - h) {
      return done("COOLING", evidence, "building_cool");
    }
    if (intensity < thresholds.emergingMin) {
      return done("EMERGING", evidence, "building_backoff");
    }
    return done("BUILDING", evidence, "building_hold");
  }

  if (current === "EMERGING") {
    if (enterBuilding) {
      return done("BUILDING", evidence, "emerging_to_building");
    }
    if (intensity < thresholds.dormantMax || slope < 0) {
      return done("DORMANT", evidence, "emerging_fade");
    }
    return done("EMERGING", evidence, "emerging_hold");
  }

  if (current === "COOLING") {
    if (reclaimSignal) {
      return done("RECLAIMING", evidence, "cooling_to_reclaiming");
    }
    if (fadingSignal || intensity <= thresholds.dormantMax + h) {
      return done("FADING", evidence, "cooling_to_fading");
    }
    if (enterActive && slope > 0) {
      return done("ACTIVE", evidence, "cooling_resume_active");
    }
    return done("COOLING", evidence, "cooling_hold");
  }

  if (current === "FADING") {
    if (reclaimSignal && intensity >= thresholds.emergingMin) {
      return done("RECLAIMING", evidence, "fading_to_reclaiming");
    }
    if (intensity <= thresholds.dormantMax || part < thresholds.participationEmerging * 0.5) {
      return done("DORMANT", evidence, "fading_to_dormant");
    }
    return done("FADING", evidence, "fading_hold");
  }

  if (current === "RECLAIMING") {
    if (enterActive) {
      return done("ACTIVE", evidence, "reclaim_to_active");
    }
    if (enterBuilding || intensity >= thresholds.buildingMin) {
      return done("BUILDING", evidence, "reclaim_to_building");
    }
    if (coolingSignal) {
      return done("COOLING", evidence, "reclaim_fail_cool");
    }
    if (fadingSignal) {
      return done("FADING", evidence, "reclaim_fail_fade");
    }
    return done("RECLAIMING", evidence, "reclaim_hold");
  }

  if (current === "DORMANT" || current == null) {
    if (enterEmerging || (intensity >= thresholds.emergingMin && part >= thresholds.participationEmerging)) {
      return done("EMERGING", evidence, "dormant_to_emerging");
    }
    return done("DORMANT", evidence, "dormant_hold");
  }

  // UNKNOWN / HALTED calculated fallback when overrides cleared by caller.
  if (intensity >= thresholds.buildingMin && slope > 0) {
    return done("EMERGING", evidence, "resume_emerging");
  }
  if (coolingSignal) {
    return done("COOLING", evidence, "resume_cooling");
  }
  if (fadingSignal || intensity <= thresholds.dormantMax) {
    return done("DORMANT", evidence, "resume_dormant");
  }
  return done("EMERGING", evidence, "resume_default_emerging");
}

function done(
  state: MomentumLifecycleState,
  evidence: TransitionEvidence[],
  code: string
): ProposeResult {
  return {
    state,
    evidence: [
      ...evidence,
      { code: `propose_${code}`, detail: `Proposed ${state}` },
    ],
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
