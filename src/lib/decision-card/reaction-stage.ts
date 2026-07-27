import type { ReactionStage, ReactionStageResult, ReactionStageRule } from "./types.ts";

export interface ReactionStageInput {
  /** Seconds since provider publish */
  ageSec: number | null;
  /** |%| move since publication */
  moveSincePublicationAbs: number | null;
  /** Relative volume */
  rVol: number | null;
  /** Judgment timing when known */
  timing?: string | null;
  /** Stale / recycled language detected */
  staleLanguage: boolean;
  /** Scheduled language */
  scheduledLanguage: boolean;
  /** Already extended on day (e.g. |day change| >= 25) */
  dayMoveAbs: number | null;
}

/**
 * Deterministic reaction stage — every contributing rule is returned for the expandable drawer.
 * Never implies profit probability.
 */
export function computeReactionStage(input: ReactionStageInput): ReactionStageResult {
  const rules: ReactionStageRule[] = [];

  const age = input.ageSec;
  const move = input.moveSincePublicationAbs;
  const rVol = input.rVol;
  const dayMove = input.dayMoveAbs;

  const staleByTiming = input.timing === "STALE" || input.staleLanguage;
  const scheduled = input.timing === "SCHEDULED" || input.scheduledLanguage;

  rules.push({
    id: "stale_language_or_timing",
    label: "Stale / recycled story signals",
    passed: staleByTiming,
    detail: staleByTiming
      ? "Timing or headline language indicates recycled / previously disclosed news"
      : "No stale-language or STALE timing flag",
  });

  rules.push({
    id: "age_over_6h",
    label: "Catalyst age > 6 hours",
    passed: age != null && age > 6 * 3600,
    detail:
      age == null
        ? "Age unavailable"
        : `Age ${Math.round(age / 60)}m — ${age > 6 * 3600 ? "beyond early window" : "within 6h"}`,
  });

  rules.push({
    id: "scheduled_event",
    label: "Scheduled event language",
    passed: scheduled,
    detail: scheduled
      ? "Headline/timing looks scheduled (not an immediate surprise)"
      : "Not classified as scheduled",
  });

  rules.push({
    id: "extended_day_move",
    label: "Already-extended day move (|Δ| ≥ 25%)",
    passed: dayMove != null && dayMove >= 25,
    detail:
      dayMove == null
        ? "Day move unavailable"
        : `Day |move| ${dayMove.toFixed(1)}%`,
  });

  rules.push({
    id: "large_post_publish_move",
    label: "Large move since publication (|Δ| ≥ 12%)",
    passed: move != null && move >= 12,
    detail: move == null ? "Post-publish move unavailable" : `|Δ since publish| ${move.toFixed(1)}%`,
  });

  rules.push({
    id: "elevated_rvol",
    label: "Elevated relative volume (RVol ≥ 3)",
    passed: rVol != null && rVol >= 3,
    detail: rVol == null ? "RVol unavailable" : `RVol ${rVol.toFixed(1)}x`,
  });

  rules.push({
    id: "fresh_window",
    label: "Fresh window (age ≤ 15 minutes)",
    passed: age != null && age <= 15 * 60,
    detail:
      age == null ? "Age unavailable" : `Age ${Math.round(age / 60)}m`,
  });

  rules.push({
    id: "active_window",
    label: "Active window (age ≤ 90 minutes, reacting)",
    passed:
      age != null &&
      age <= 90 * 60 &&
      ((move != null && move >= 1.5) || (rVol != null && rVol >= 2)),
    detail: "Age ≤ 90m with material tape reaction when data present",
  });

  // Priority: STALE > EXTENDED > EARLY > ACTIVE > default ACTIVE/STALE
  let stage: ReactionStage = "ACTIVE";

  if (rules.find((r) => r.id === "stale_language_or_timing")?.passed || rules.find((r) => r.id === "age_over_6h")?.passed) {
    stage = "STALE";
  } else if (
    rules.find((r) => r.id === "extended_day_move")?.passed ||
    rules.find((r) => r.id === "large_post_publish_move")?.passed
  ) {
    stage = "EXTENDED";
  } else if (
    rules.find((r) => r.id === "fresh_window")?.passed &&
    !rules.find((r) => r.id === "scheduled_event")?.passed
  ) {
    stage = "EARLY";
  } else if (rules.find((r) => r.id === "active_window")?.passed) {
    stage = "ACTIVE";
  } else if (age != null && age > 90 * 60) {
    stage = "STALE";
    rules.push({
      id: "age_over_90m_fallback",
      label: "Age > 90 minutes without early/active criteria",
      passed: true,
      detail: "Fallback STALE when the tape window has aged out",
    });
  } else {
    stage = "ACTIVE";
  }

  const explanation = rules
    .filter((r) => r.passed)
    .map((r) => `${r.label}: ${r.detail}`)
    .join(" · ");

  return {
    stage,
    rules,
    explanation: explanation || "Insufficient tape/timing data — default ACTIVE",
  };
}
