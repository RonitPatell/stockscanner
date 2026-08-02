import {
  clamp100,
  sessionAttentionMult,
  tierFromPriority,
} from "./config.ts";
import type {
  AttentionCandidateInput,
  AttentionReason,
  AttentionScore,
  AttentionVariant,
  DataConfidence,
  LeaderSelectionConfig,
} from "./types.ts";
import { MONITOR_ATTENTION_VERSION } from "./version.ts";

function confFactor(c: DataConfidence): number {
  switch (c) {
    case "HIGH":
      return 1;
    case "MEDIUM":
      return 0.85;
    case "LOW":
      return 0.55;
    case "UNAVAILABLE":
      return 0.2;
    default:
      return 0.5;
  }
}

function reactionStagePoints(stage: AttentionCandidateInput["reactionStage"]): {
  points: number;
  detail: string;
} {
  switch (stage) {
    case "initial":
      return { points: 14, detail: "Initial reaction stage — elevated inspection urgency" };
    case "developing":
      return { points: 12, detail: "Developing reaction — ongoing inspection interest" };
    case "pre":
      return { points: 8, detail: "Pre-reaction — early watch" };
    case "extended":
      return { points: 5, detail: "Extended stage — lower novelty" };
    case "exhausted":
      return { points: 1, detail: "Exhausted stage — minimal novelty" };
    default:
      return { points: 0, detail: "Reaction stage unknown" };
  }
}

function catalystFreshnessPoints(ageMs: number | null): number {
  if (ageMs == null || !Number.isFinite(ageMs) || ageMs < 0) return 0;
  const min = ageMs / 60_000;
  if (min <= 5) return 18;
  if (min <= 15) return 14;
  if (min <= 60) return 8;
  if (min <= 180) return 3;
  return 0;
}

function rankHistoryPoints(ranks: number[] | null | undefined): number {
  if (!ranks || ranks.length < 2) return 0;
  const latest = ranks[ranks.length - 1]!;
  const prev = ranks[ranks.length - 2]!;
  // Improved rank (lower number) → small boost for rising attention.
  if (latest < prev) return Math.min(8, (prev - latest) * 2);
  if (latest > prev + 2) return -2; // fading
  return 0;
}

/**
 * Score attention priority for one candidate.
 * Explicitly inspection-order only — never a trade recommendation.
 */
export function scoreAttention(input: {
  candidate: AttentionCandidateInput;
  variant: AttentionVariant;
  userScopeId?: string | null;
  leaderConfig: LeaderSelectionConfig;
  nowMs: number;
}): AttentionScore {
  const c = input.candidate;
  const reasons: AttentionReason[] = [];
  let total = 0;
  const warnings: string[] = [];
  let criticalBypass = false;

  // Momentum intensity (capped share).
  if (c.momentumIntensity != null && Number.isFinite(c.momentumIntensity)) {
    const raw = clamp100(c.momentumIntensity) * 0.28;
    const pts = Math.round(raw * 10) / 10;
    total += pts;
    reasons.push({
      code: "momentum_intensity",
      contribution: pts,
      detail: `Momentum intensity ${clamp100(c.momentumIntensity)}/100 (activity, not trade attractiveness)`,
    });
  }

  // Verified catalyst materiality + age.
  if (c.catalystMateriality != null && c.catalystVerified) {
    const mat = clamp100(c.catalystMateriality) * 0.22;
    total += mat;
    reasons.push({
      code: "catalyst_materiality",
      contribution: Math.round(mat * 10) / 10,
      detail: `Verified catalyst materiality ${clamp100(c.catalystMateriality)}/100`,
    });
    const fresh = catalystFreshnessPoints(c.catalystAgeMs);
    if (fresh > 0) {
      total += fresh;
      reasons.push({
        code: "catalyst_freshness",
        contribution: fresh,
        detail: `Catalyst age ${Math.round((c.catalystAgeMs ?? 0) / 1000)}s`,
      });
    }
    // Fresh + highly material verified catalyst may bypass leader delay.
    if (c.catalystMateriality >= 85 && fresh >= 14) {
      criticalBypass = true;
    }
  } else if (c.catalystMateriality != null && !c.catalystVerified) {
    warnings.push("Unverified catalyst materiality ignored for scoring");
  }

  // Halt / resumption urgency.
  const halt = c.haltUrgency;
  const life = c.haltLifecycle ?? "none";
  if (halt != null && halt > 0) {
    const haltPts = clamp100(halt) * 0.35;
    total += haltPts;
    const isResumption =
      life === "resumption_quote_scheduled" || life === "resumed";
    reasons.push({
      code: isResumption ? "resumption_urgency" : "halt_urgency",
      contribution: Math.round(haltPts * 10) / 10,
      detail: isResumption
        ? `Resumption urgency ${clamp100(halt)}/100`
        : `Halt urgency ${clamp100(halt)}/100 (${life})`,
    });
    if (halt >= 70 || life === "halted" || life === "resumption_quote_scheduled") {
      criticalBypass = true;
    }
  }

  // Dilution / regulatory.
  if (c.dilutionUrgency != null && c.dilutionUrgency > 0) {
    const d = clamp100(c.dilutionUrgency) * 0.2;
    total += d;
    reasons.push({
      code: "dilution_urgency",
      contribution: Math.round(d * 10) / 10,
      detail: `Dilution/offering urgency ${clamp100(c.dilutionUrgency)}/100`,
    });
    if (c.dilutionUrgency >= 80) criticalBypass = true;
  }
  if (c.regulatoryUrgency != null && c.regulatoryUrgency > 0) {
    const r = clamp100(c.regulatoryUrgency) * 0.18;
    total += r;
    reasons.push({
      code: "regulatory_urgency",
      contribution: Math.round(r * 10) / 10,
      detail: `Regulatory-event urgency ${clamp100(c.regulatoryUrgency)}/100`,
    });
    if (c.regulatoryUrgency >= 80) criticalBypass = true;
  }

  // User-specific signals (variant=user only).
  if (input.variant === "user") {
    if (c.onWatchlist) {
      total += 16;
      reasons.push({
        code: "watchlist_match",
        contribution: 16,
        detail: "On user watchlist — personalize inspection order",
      });
    }
    if (c.alertStrategyMatch) {
      const strength = clamp100((c.alertStrategyStrength ?? 1) * 100) / 100;
      const pts = Math.round(18 * strength * 10) / 10;
      total += pts;
      reasons.push({
        code: "alert_strategy_match",
        contribution: pts,
        detail: "Matched user Alert Strategy — inspection priority only",
      });
    }
  }

  // Reaction stage.
  const stage = reactionStagePoints(c.reactionStage);
  if (stage.points > 0) {
    total += stage.points;
    reasons.push({
      code: "reaction_stage",
      contribution: stage.points,
      detail: stage.detail,
    });
  }

  // Data confidence (positive contribution when high; penalty when low).
  const cf = confFactor(c.dataConfidence);
  const confPts = Math.round((cf - 0.55) * 12 * 10) / 10;
  if (confPts !== 0) {
    total += confPts;
    reasons.push({
      code: "data_confidence",
      contribution: confPts,
      detail: `Data confidence ${c.dataConfidence}`,
    });
  }

  // Market session.
  const sm = sessionAttentionMult(c.session);
  if (sm !== 1) {
    const before = total;
    total = total * sm;
    const delta = Math.round((total - before) * 10) / 10;
    reasons.push({
      code: "market_session",
      contribution: delta,
      detail: `Session ${c.session} multiplier ${sm}`,
    });
  }

  // Recent rank history.
  const rh = rankHistoryPoints(c.recentRanks);
  if (rh !== 0) {
    total += rh;
    reasons.push({
      code: "rank_history",
      contribution: rh,
      detail: rh > 0 ? "Rising in recent ranks" : "Fading in recent ranks",
    });
  }

  // Stale / low-confidence penalties (data quality — not trading risk).
  const age = c.sourceDataAgeMs;
  if (age != null && age > input.leaderConfig.staleScoreMs) {
    const pen = age > input.leaderConfig.staleLeaderMs ? -18 : -8;
    total += pen;
    reasons.push({
      code: "stale_penalty",
      contribution: pen,
      detail: `Source data age ${age}ms`,
    });
    warnings.push("Stale market data — inspect with caution");
  }
  if (c.dataConfidence === "LOW" || c.dataConfidence === "UNAVAILABLE") {
    const pen = c.dataConfidence === "UNAVAILABLE" ? -20 : -10;
    total += pen;
    reasons.push({
      code: "low_confidence_penalty",
      contribution: pen,
      detail: `Low/unavailable data confidence (${c.dataConfidence})`,
    });
    warnings.push("Low-confidence data — not suitable as silent leader");
  }

  const attentionPriority = clamp100(total);
  const priorityTier = tierFromPriority(attentionPriority);

  // Leader eligibility: stale/low-confidence may still score but need warning.
  const staleForLeader =
    age != null && age > input.leaderConfig.staleLeaderMs;
  const lowConf =
    c.dataConfidence === "LOW" || c.dataConfidence === "UNAVAILABLE";
  let eligibleForLeader = true;
  if (staleForLeader || lowConf) {
    eligibleForLeader = false;
    if (!warnings.some((w) => /leader/i.test(w))) {
      warnings.push(
        "Not eligible to become leader without explicit stale/low-confidence warning"
      );
    }
  }
  // Critical halt can still surface as leader with warning retained.
  if (criticalBypass && (staleForLeader || lowConf)) {
    eligibleForLeader = true; // allowed, but warnings must be attached
    warnings.push("Critical event bypass — leader allowed with warning");
  }

  reasons.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  return {
    symbol: c.symbol.toUpperCase(),
    variant: input.variant,
    userScopeId:
      input.variant === "user" ? (input.userScopeId ?? "user") : null,
    attentionPriority,
    priorityTier,
    reasons,
    calcVersion: MONITOR_ATTENTION_VERSION,
    calculatedAt: new Date(input.nowMs).toISOString(),
    eligibleForLeader,
    warnings,
    criticalBypass,
    session: c.session,
  };
}
