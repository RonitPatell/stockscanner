import { REACTION_STAGE_ENGINE_VERSION } from "./version.ts";
import { resolveThresholds } from "./config.ts";
import { computeReactionMetrics } from "./metrics.ts";
import { applyHysteresis } from "./hysteresis.ts";
import { buildReactionTimeline } from "./timeline.ts";
import type {
  ConflictingEvidence,
  ReactionStage,
  ReactionStageCatalystInput,
  ReactionStageResult,
  ReactionStageRuleContribution,
} from "./types.ts";

const STALE_RE =
  /\b(as\s+previously\s+(announced|reported|disclosed)|reiterates?|previously\s+disclosed)\b/i;
const SCHEDULED_RE =
  /\b(scheduled|will\s+(report|announce|host)|upcoming|set\s+to\s+(report|announce))\b/i;

/**
 * Deterministic Reaction Stage Engine.
 * Does NOT predict price or probability of profit.
 */
export function computeReactionStageEngine(
  input: ReactionStageCatalystInput
): ReactionStageResult {
  const nowMs = input.nowMs ?? Date.now();
  const metrics = computeReactionMetrics({ ...input, nowMs });
  const { profileId, thresholds } = resolveThresholds({
    session: metrics.marketSession,
    category: input.category,
    price: metrics.currentPrice.value ?? metrics.priceAtIngestion.value,
    floatShares: input.floatShares ?? null,
    dollarVolume: input.dollarVolume ?? null,
    spreadBps: input.tape?.spreadBps ?? null,
  });

  const rules: ReactionStageRuleContribution[] = [];
  const conflicts: ConflictingEvidence[] = [];

  const text = `${input.headline} ${input.summary ?? ""}`;
  const staleLang =
    input.judgmentTiming === "STALE" ||
    STALE_RE.test(text) ||
    (metrics.previousDisclosureSimilarity.value != null &&
      metrics.previousDisclosureSimilarity.value >= 0.7);
  const scheduled =
    input.judgmentTiming === "SCHEDULED" || SCHEDULED_RE.test(text);

  const age = metrics.ageSec;
  const moveAbs =
    metrics.pctMoveSincePublication.value != null
      ? Math.abs(metrics.pctMoveSincePublication.value)
      : null;
  const moveBeforeAbs =
    metrics.pctMoveBeforePublication.value != null
      ? Math.abs(metrics.pctMoveBeforePublication.value)
      : null;
  const dayMove =
    input.tape?.dayChangePercent != null
      ? Math.abs(input.tape.dayChangePercent)
      : null;
  const rVol = metrics.relativeVolume.value;
  const spread = input.tape?.spreadBps ?? null;
  const unreliableTs =
    metrics.sourceTimestampQuality === "MISSING" ||
    metrics.sourceTimestampQuality === "INVALID" ||
    metrics.sourceTimestampQuality === "ARTICLE_UPDATED_TIME";

  // Critical data gate → UNKNOWN
  const missingPublish =
    thresholds.requirePublishTime &&
    (!metrics.providerPublishedAt || unreliableTs);
  const missingPrice =
    thresholds.requireCurrentOrIngestPrice &&
    metrics.currentPrice.availability === "unavailable" &&
    metrics.priceAtIngestion.availability === "unavailable";

  rules.push({
    id: "critical_data_present",
    label: "Critical timing/price data present",
    passed: !missingPublish && !missingPrice,
    weight: 1,
    detail: missingPublish
      ? `Publish time unreliable (${metrics.sourceTimestampQuality})`
      : missingPrice
        ? "Current and ingest prices unavailable"
        : "Publish time and at least one price anchor present",
    profileId,
  });

  rules.push({
    id: "stale_or_recycled",
    label: "Stale / recycled disclosure",
    passed: !!staleLang,
    weight: 1,
    detail: staleLang
      ? "Headline or similarity indicates previously disclosed news"
      : "No recycled-disclosure signal",
    profileId,
  });

  rules.push({
    id: "move_before_publication",
    label: "Material move before publication",
    passed: moveBeforeAbs != null && moveBeforeAbs >= 3,
    weight: 0.8,
    detail:
      moveBeforeAbs == null
        ? "Pre-publish move unavailable (tape not stored or lag too large)"
        : `|Δ before publish| ${moveBeforeAbs.toFixed(1)}%`,
    profileId,
  });

  rules.push({
    id: "age_stale",
    label: `Age > stale threshold (${Math.round(thresholds.staleAgeSec / 60)}m)`,
    passed: age != null && age > thresholds.staleAgeSec,
    weight: 1,
    detail: age == null ? "Age unavailable" : `Age ${Math.round(age / 60)}m`,
    profileId,
  });

  rules.push({
    id: "extended_post_publish",
    label: `Extended post-publish move (|Δ| ≥ ${thresholds.extendedMovePct}%)`,
    passed: moveAbs != null && moveAbs >= thresholds.extendedMovePct,
    weight: 1,
    detail:
      moveAbs == null
        ? "Post-publish move unavailable"
        : `|Δ since publish| ${moveAbs.toFixed(1)}%`,
    profileId,
  });

  rules.push({
    id: "extended_day_move",
    label: `Extended day move (|Δ| ≥ ${thresholds.extendedDayMovePct}%)`,
    passed: dayMove != null && dayMove >= thresholds.extendedDayMovePct,
    weight: 0.9,
    detail: dayMove == null ? "Day move unavailable" : `Day |Δ| ${dayMove.toFixed(1)}%`,
    profileId,
  });

  rules.push({
    id: "fresh_early_window",
    label: `Fresh window (age ≤ ${Math.round(thresholds.earlyMaxAgeSec / 60)}m)`,
    passed: age != null && age <= thresholds.earlyMaxAgeSec,
    weight: 1,
    detail: age == null ? "Age unavailable" : `Age ${Math.round(age / 60)}m`,
    profileId,
  });

  rules.push({
    id: "scheduled_event",
    label: "Scheduled event language",
    passed: scheduled,
    weight: 0.7,
    detail: scheduled ? "Looks scheduled, not a surprise print" : "Not scheduled",
    profileId,
  });

  rules.push({
    id: "active_reaction",
    label: "Active tape reaction",
    passed:
      age != null &&
      age <= thresholds.activeMaxAgeSec &&
      ((moveAbs != null && moveAbs >= thresholds.activeMovePct) ||
        (rVol != null && rVol >= thresholds.activeRvol)),
    weight: 1,
    detail: "Age within active window with material move or RVol when present",
    profileId,
  });

  rules.push({
    id: "wide_spread_low_float",
    label: "Wide spread on thin name",
    passed:
      spread != null &&
      spread >= thresholds.wideSpreadBps &&
      (input.floatShares == null || input.floatShares < 20_000_000),
    weight: 0.6,
    detail:
      spread == null
        ? "Spread unavailable"
        : `Spread ${spread.toFixed(0)} bps (threshold ${thresholds.wideSpreadBps})`,
    profileId,
  });

  rules.push({
    id: "halt_active",
    label: "Halt count > 0",
    passed: (metrics.haltCount.value ?? 0) > 0,
    weight: 0.5,
    detail:
      metrics.haltCount.availability === "unavailable"
        ? "Halt feed unavailable"
        : `Halt count ${metrics.haltCount.value}`,
    profileId,
  });

  // Conflicting evidence
  if (
    rules.find((r) => r.id === "fresh_early_window")?.passed &&
    rules.find((r) => r.id === "move_before_publication")?.passed
  ) {
    conflicts.push({
      id: "early_vs_premove",
      label: "Fresh print vs pre-move",
      detail:
        "Headline is fresh by clock, but price already moved before publication — FOMO risk",
    });
  }
  if (
    rules.find((r) => r.id === "fresh_early_window")?.passed &&
    rules.find((r) => r.id === "extended_post_publish")?.passed
  ) {
    conflicts.push({
      id: "early_vs_extended",
      label: "Fresh clock vs extended move",
      detail: "Age says EARLY but post-publish move already looks EXTENDED",
    });
  }
  if (
    rules.find((r) => r.id === "active_reaction")?.passed &&
    rules.find((r) => r.id === "stale_or_recycled")?.passed
  ) {
    conflicts.push({
      id: "active_vs_recycled",
      label: "Active tape vs recycled story",
      detail: "Tape is reacting but language suggests previously disclosed news",
    });
  }

  let candidate: ReactionStage = "ACTIVE";

  if (!rules.find((r) => r.id === "critical_data_present")?.passed) {
    candidate = "UNKNOWN";
  } else if (
    rules.find((r) => r.id === "stale_or_recycled")?.passed ||
    rules.find((r) => r.id === "age_stale")?.passed
  ) {
    candidate = "STALE";
  } else if (
    rules.find((r) => r.id === "extended_post_publish")?.passed ||
    rules.find((r) => r.id === "extended_day_move")?.passed
  ) {
    candidate = "EXTENDED";
  } else if (
    rules.find((r) => r.id === "fresh_early_window")?.passed &&
    !rules.find((r) => r.id === "scheduled_event")?.passed &&
    !rules.find((r) => r.id === "move_before_publication")?.passed
  ) {
    candidate = "EARLY";
  } else if (rules.find((r) => r.id === "active_reaction")?.passed) {
    candidate = "ACTIVE";
  } else if (age != null && age > thresholds.activeMaxAgeSec) {
    candidate = "STALE";
    rules.push({
      id: "age_past_active_fallback",
      label: "Past active window without early/extended criteria",
      passed: true,
      weight: 0.8,
      detail: "Fallback STALE",
      profileId,
    });
  } else {
    candidate = "ACTIVE";
  }

  // After-hours: if scheduled and fresh → still not EARLY surprise
  if (candidate === "EARLY" && scheduled) {
    candidate = "ACTIVE";
  }

  const forceStale = !!rules.find((r) => r.id === "stale_or_recycled")?.passed;
  const hyst = applyHysteresis({
    candidate,
    previous: input.previousStage,
    previousAtMs: input.previousStageAtMs,
    nowMs,
    hysteresisMs: thresholds.hysteresisMs,
    force: forceStale || candidate === "UNKNOWN",
  });

  const passed = rules.filter((r) => r.passed);
  const explanation =
    hyst.stage === "UNKNOWN"
      ? `UNKNOWN — critical data missing or provider timestamp unreliable (${metrics.sourceTimestampQuality}). Not a prediction.`
      : passed.length
        ? `${hyst.stage}: ${passed.map((r) => r.label).join("; ")}.`
        : `${hyst.stage}: no strong rule fired.`;

  if (hyst.flappedSuppressed) {
    rules.push({
      id: "hysteresis_hold",
      label: "Hysteresis hold",
      passed: true,
      weight: 1,
      detail: `Held ${input.previousStage} (< ${thresholds.hysteresisMs}ms dwell)`,
      profileId,
    });
  }

  const timeline = buildReactionTimeline(input, metrics, hyst.stage);

  return {
    engineVersion: REACTION_STAGE_ENGINE_VERSION,
    stage: hyst.stage,
    previousStage: input.previousStage ?? null,
    flappedSuppressed: hyst.flappedSuppressed,
    metrics,
    rules,
    explanation:
      explanation +
      (conflicts.length
        ? ` Conflicting: ${conflicts.map((c) => c.label).join(", ")}.`
        : "") +
      " Informational stage only — not investment advice.",
    conflictingEvidence: conflicts,
    timeline,
    profileId,
    computedAt: new Date(nowMs).toISOString(),
  };
}

/** Incremental recompute when live tape changes. */
export function recomputeReactionStage(
  input: ReactionStageCatalystInput,
  prior: ReactionStageResult | null
): ReactionStageResult {
  return computeReactionStageEngine({
    ...input,
    previousStage: prior?.stage ?? input.previousStage,
    previousStageAtMs: prior
      ? new Date(prior.computedAt).getTime()
      : input.previousStageAtMs,
  });
}
