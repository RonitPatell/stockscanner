import { normalizeMonitorSymbol } from "./freshness.ts";
import {
  MONITOR_SNAPSHOT_MAX_FIELD,
  MONITOR_SNAPSHOT_MAX_LADDER,
  MONITOR_SNAPSHOT_MAX_TAPE,
} from "./limits.ts";
import type {
  MonitorPublicSnapshot,
  MonitorSnapshotTicker,
  SnapshotValidationIssue,
  SnapshotValidationResult,
} from "./types.ts";
import { MONITOR_SNAPSHOT_SCHEMA_VERSION } from "./version.ts";

/** Keys that must never appear in the public snapshot payload. */
const FORBIDDEN_KEY_FRAGMENTS = [
  "password",
  "passwordhash",
  "webhook",
  "stripe",
  "vapid",
  "phonenumber",
  "phone",
  "email",
  "apikey",
  "api_key",
  "secret",
  "credential",
  "userid",
  "user_id",
  "watchlist",
  "strategyjson",
  "strategy_contents",
  "rawarticle",
  "filingtext",
  "analogue",
  "decision",
  "subscription",
] as const;

function collectIssues(
  value: unknown,
  path: string,
  issues: SnapshotValidationIssue[]
): void {
  if (value == null) return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      collectIssues(value[i], `${path}[${i}]`, issues);
    }
    return;
  }
  if (typeof value !== "object") return;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const lower = k.toLowerCase();
    if (FORBIDDEN_KEY_FRAGMENTS.some((f) => lower.includes(f))) {
      issues.push({
        code: "forbidden_field",
        message: `Forbidden private/sensitive field "${k}"`,
        path: path ? `${path}.${k}` : k,
      });
    }
    collectIssues(v, path ? `${path}.${k}` : k, issues);
  }
}

function tickerComplete(
  t: MonitorSnapshotTicker,
  path: string,
  issues: SnapshotValidationIssue[]
): void {
  if (!t.symbol || typeof t.symbol !== "string") {
    issues.push({
      code: "missing_symbol",
      message: "Ticker missing symbol",
      path,
    });
  }
  if (t.attentionPriority == null || !Number.isFinite(t.attentionPriority)) {
    issues.push({
      code: "missing_attention",
      message: "Ticker missing attentionPriority",
      path: `${path}.attentionPriority`,
    });
  }
  if (!t.reactionStage) {
    issues.push({
      code: "missing_reaction_stage",
      message: "Ticker missing reactionStage",
      path: `${path}.reactionStage`,
    });
  }
  if (!t.dataConfidence) {
    issues.push({
      code: "missing_confidence",
      message: "Ticker missing dataConfidence",
      path: `${path}.dataConfidence`,
    });
  }
  if (!t.haltState) {
    issues.push({
      code: "missing_halt_state",
      message: "Ticker missing haltState",
      path: `${path}.haltState`,
    });
  }
  if (!t.tradeability) {
    issues.push({
      code: "missing_tradeability",
      message: "Ticker missing tradeability",
      path: `${path}.tradeability`,
    });
  }
  if (!t.primaryRisk) {
    issues.push({
      code: "missing_primary_risk",
      message: "Ticker missing primaryRisk",
      path: `${path}.primaryRisk`,
    });
  }
  if (!normalizeMonitorSymbol(t.symbol)) {
    issues.push({
      code: "invalid_symbol",
      message: "Ticker symbol failed resolution validation",
      path: `${path}.symbol`,
    });
  }
  if (
    t.snapshotGeneratedAtMs == null ||
    !Number.isFinite(t.snapshotGeneratedAtMs)
  ) {
    issues.push({
      code: "missing_snapshot_generated_at",
      message: "Ticker missing snapshotGeneratedAtMs",
      path: `${path}.snapshotGeneratedAtMs`,
    });
  }
  if (!t.freshnessVerdict) {
    issues.push({
      code: "missing_freshness_verdict",
      message: "Ticker missing freshnessVerdict",
      path: `${path}.freshnessVerdict`,
    });
  }
  if (!Array.isArray(t.fieldFreshness)) {
    issues.push({
      code: "missing_field_freshness",
      message: "Ticker missing fieldFreshness",
      path: `${path}.fieldFreshness`,
    });
  }
  if (!t.sourceHealth) {
    issues.push({
      code: "missing_ticker_source_health",
      message: "Ticker missing sourceHealth",
      path: `${path}.sourceHealth`,
    });
  }
  if (!t.calculationVersion) {
    issues.push({
      code: "missing_ticker_calc_version",
      message: "Ticker missing calculationVersion",
      path: `${path}.calculationVersion`,
    });
  }
  for (const field of t.fieldFreshness ?? []) {
    if (
      field.ageMs != null &&
      (field.timeQuality === "estimated" || field.timeQuality === "invalid") &&
      !field.reason
    ) {
      issues.push({
        code: "unlabelled_latency",
        message: `Latency for ${field.field} used non-provider time without reason`,
        path: `${path}.fieldFreshness`,
      });
    }
  }
}

/**
 * Validate a candidate snapshot before Redis pointer swap.
 * Incomplete / private-field payloads must never replace a valid active snapshot.
 */
export function validateMonitorPublicSnapshot(
  snap: MonitorPublicSnapshot | null | undefined
): SnapshotValidationResult {
  const issues: SnapshotValidationIssue[] = [];
  if (!snap || typeof snap !== "object") {
    return {
      ok: false,
      issues: [{ code: "null_snapshot", message: "Snapshot is null/undefined" }],
    };
  }

  if (!snap.schemaVersion) {
    issues.push({ code: "schema_version", message: "Missing schemaVersion" });
  } else if (
    typeof snap.schemaVersion === "string" &&
    !snap.schemaVersion.startsWith("monitor-public-snapshot-")
  ) {
    issues.push({
      code: "schema_version_mismatch",
      message: `Unexpected schemaVersion ${snap.schemaVersion}; expected prefix of ${MONITOR_SNAPSHOT_SCHEMA_VERSION}`,
    });
  }

  if (!snap.calculationVersion) {
    issues.push({
      code: "calculation_version",
      message: "Missing calculationVersion",
    });
  }
  if (!snap.snapshotId) {
    issues.push({ code: "snapshot_id", message: "Missing snapshotId" });
  }
  if (!snap.lastEventId) {
    issues.push({ code: "last_event_id", message: "Missing lastEventId" });
  }
  if (!snap.generatedAt || !Number.isFinite(snap.generatedAtMs)) {
    issues.push({ code: "generated_at", message: "Missing generatedAt" });
  }
  if (!snap.marketSession) {
    issues.push({ code: "market_session", message: "Missing marketSession" });
  }
  if (!snap.sourceHealthSummary) {
    issues.push({
      code: "source_health",
      message: "Missing sourceHealthSummary",
    });
  }
  if (!snap.dataQuality) {
    issues.push({ code: "data_quality", message: "Missing dataQuality" });
  }
  if (!snap.freshness) {
    issues.push({
      code: "freshness_summary",
      message: "Missing freshness summary",
    });
  } else {
    if (!snap.freshness.liveLabel) {
      issues.push({
        code: "live_label",
        message: "Missing freshness.liveLabel",
        path: "freshness.liveLabel",
      });
    }
    if (!Array.isArray(snap.freshness.excludedTickers)) {
      issues.push({
        code: "excluded_tickers",
        message: "freshness.excludedTickers must be an array",
        path: "freshness.excludedTickers",
      });
    }
  }

  if (
    snap.globalLeader &&
    Array.isArray(snap.priorityLadder) &&
    !snap.priorityLadder.some(
      (t) => t.symbol === snap.globalLeader && t.leaderEligible
    )
  ) {
    issues.push({
      code: "stale_leader",
      message: "globalLeader must be leaderEligible",
      path: "globalLeader",
    });
  }

  if (!Array.isArray(snap.priorityLadder)) {
    issues.push({
      code: "ladder_type",
      message: "priorityLadder must be an array",
    });
  } else {
    if (snap.priorityLadder.length > MONITOR_SNAPSHOT_MAX_LADDER) {
      issues.push({
        code: "ladder_overflow",
        message: `priorityLadder exceeds ${MONITOR_SNAPSHOT_MAX_LADDER}`,
      });
    }
    snap.priorityLadder.forEach((t, i) =>
      tickerComplete(t, `priorityLadder[${i}]`, issues)
    );
  }

  if (!Array.isArray(snap.momentumField)) {
    issues.push({
      code: "field_type",
      message: "momentumField must be an array",
    });
  } else if (snap.momentumField.length > MONITOR_SNAPSHOT_MAX_FIELD) {
    issues.push({
      code: "field_overflow",
      message: `momentumField exceeds ${MONITOR_SNAPSHOT_MAX_FIELD}`,
    });
  } else {
    snap.momentumField.forEach((t, i) =>
      tickerComplete(t, `momentumField[${i}]`, issues)
    );
  }

  if (!Array.isArray(snap.recentEventTape)) {
    issues.push({
      code: "tape_type",
      message: "recentEventTape must be an array",
    });
  } else if (snap.recentEventTape.length > MONITOR_SNAPSHOT_MAX_TAPE) {
    issues.push({
      code: "tape_overflow",
      message: `recentEventTape exceeds ${MONITOR_SNAPSHOT_MAX_TAPE}`,
    });
  }

  // Empty ladder is allowed only when explicitly recovery or markets quiet —
  // but still requires identity fields. Incomplete = missing required meta.
  collectIssues(snap, "", issues);

  return { ok: issues.length === 0, issues };
}

/** True when the snapshot has enough content to serve clients (non-empty ladder or recovery). */
export function isSnapshotRenderable(snap: MonitorPublicSnapshot): boolean {
  if (snap.recovery) return true;
  return snap.priorityLadder.length > 0 || snap.momentumField.length > 0;
}
