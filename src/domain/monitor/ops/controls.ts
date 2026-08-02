/**
 * Pure Monitor Ops control mutations.
 * Historical market frames are never rewritten here.
 */

import {
  defaultMonitorOpsControls,
  MONITOR_OPS_CONFIRM,
  type MonitorOpsAction,
  type MonitorOpsControls,
} from "./types.ts";
import { MONITOR_OPS_VERSION } from "./version.ts";

const MAX_QUARANTINE = 500;
const MAX_DISABLED_PROVIDERS = 64;
const MAX_DISABLED_CALC = 64;

export class MonitorOpsConfirmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MonitorOpsConfirmError";
  }
}

export class MonitorOpsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MonitorOpsValidationError";
  }
}

function normalizeSymbol(raw: unknown): string {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9./-]/g, "");
  if (!s || s.length > 16) {
    throw new MonitorOpsValidationError("invalid_symbol");
  }
  return s;
}

function normalizeId(raw: unknown, max = 64): string {
  const s = String(raw ?? "")
    .trim()
    .slice(0, max);
  if (!s) throw new MonitorOpsValidationError("invalid_id");
  return s;
}

export function requireConfirm(
  action: MonitorOpsAction,
  confirm: unknown
): void {
  const expected = MONITOR_OPS_CONFIRM[action];
  if (confirm !== expected) {
    throw new MonitorOpsConfirmError(
      `Confirmation required. Set confirm to ${expected}.`
    );
  }
}

export function sanitizeControls(
  input: Partial<MonitorOpsControls> | null | undefined,
  nowMs = Date.now()
): MonitorOpsControls {
  const base = defaultMonitorOpsControls(nowMs);
  if (!input || typeof input !== "object") return base;
  return {
    schemaVersion: MONITOR_OPS_VERSION,
    updatedAtMs:
      typeof input.updatedAtMs === "number" && Number.isFinite(input.updatedAtMs)
        ? input.updatedAtMs
        : nowMs,
    monitorGloballyDisabled: input.monitorGloballyDisabled === true,
    disabledProviders: uniqueStrings(input.disabledProviders, MAX_DISABLED_PROVIDERS),
    disabledCalculationVersions: uniqueStrings(
      input.disabledCalculationVersions,
      MAX_DISABLED_CALC
    ),
    leaderSelectionFrozen: input.leaderSelectionFrozen === true,
    frozenLeaderSymbol:
      input.frozenLeaderSymbol == null || input.frozenLeaderSymbol === ""
        ? null
        : normalizeSymbol(input.frozenLeaderSymbol),
    featureFlagCohort:
      input.featureFlagCohort == null || input.featureFlagCohort === ""
        ? null
        : normalizeId(input.featureFlagCohort, 80),
    quarantinedTickers: uniqueStrings(input.quarantinedTickers, MAX_QUARANTINE).map(
      (s) => normalizeSymbol(s)
    ),
  };
}

function uniqueStrings(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const s = String(item ?? "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

export interface ApplyControlInput {
  action: MonitorOpsAction;
  confirm: unknown;
  providerId?: unknown;
  calculationVersion?: unknown;
  symbol?: unknown;
  cohortId?: unknown;
  freezeSymbol?: unknown;
  nowMs?: number;
}

export interface ApplyControlResult {
  controls: MonitorOpsControls;
  auditDetail: Record<string, unknown>;
}

export function applyMonitorOpsControl(
  prev: MonitorOpsControls,
  input: ApplyControlInput
): ApplyControlResult {
  requireConfirm(input.action, input.confirm);
  const nowMs = input.nowMs ?? Date.now();
  let next = sanitizeControls({ ...prev, updatedAtMs: nowMs }, nowMs);
  const detail: Record<string, unknown> = { action: input.action };

  switch (input.action) {
    case "disable_provider": {
      const id = normalizeId(input.providerId, 48).toLowerCase();
      if (!next.disabledProviders.includes(id)) {
        next = {
          ...next,
          disabledProviders: [...next.disabledProviders, id].slice(
            0,
            MAX_DISABLED_PROVIDERS
          ),
        };
      }
      detail.providerId = id;
      break;
    }
    case "enable_provider": {
      const id = normalizeId(input.providerId, 48).toLowerCase();
      next = {
        ...next,
        disabledProviders: next.disabledProviders.filter((p) => p !== id),
      };
      detail.providerId = id;
      break;
    }
    case "disable_calculation_version": {
      const id = normalizeId(input.calculationVersion, 80);
      if (!next.disabledCalculationVersions.includes(id)) {
        next = {
          ...next,
          disabledCalculationVersions: [
            ...next.disabledCalculationVersions,
            id,
          ].slice(0, MAX_DISABLED_CALC),
        };
      }
      detail.calculationVersion = id;
      break;
    }
    case "enable_calculation_version": {
      const id = normalizeId(input.calculationVersion, 80);
      next = {
        ...next,
        disabledCalculationVersions: next.disabledCalculationVersions.filter(
          (v) => v !== id
        ),
      };
      detail.calculationVersion = id;
      break;
    }
    case "freeze_leader_selection": {
      const sym =
        input.freezeSymbol != null && String(input.freezeSymbol).trim()
          ? normalizeSymbol(input.freezeSymbol)
          : next.frozenLeaderSymbol;
      next = {
        ...next,
        leaderSelectionFrozen: true,
        frozenLeaderSymbol: sym,
      };
      detail.frozenLeaderSymbol = sym;
      break;
    }
    case "unfreeze_leader_selection": {
      next = {
        ...next,
        leaderSelectionFrozen: false,
        frozenLeaderSymbol: null,
      };
      break;
    }
    case "disable_monitor_global": {
      next = { ...next, monitorGloballyDisabled: true };
      break;
    }
    case "enable_monitor_global": {
      next = { ...next, monitorGloballyDisabled: false };
      break;
    }
    case "rollback_feature_flag_cohort": {
      const cohort = normalizeId(input.cohortId, 80);
      next = { ...next, featureFlagCohort: cohort };
      detail.cohortId = cohort;
      break;
    }
    case "quarantine_ticker": {
      const sym = normalizeSymbol(input.symbol);
      if (!next.quarantinedTickers.includes(sym)) {
        next = {
          ...next,
          quarantinedTickers: [...next.quarantinedTickers, sym].slice(
            0,
            MAX_QUARANTINE
          ),
        };
      }
      detail.symbol = sym;
      break;
    }
    case "release_ticker": {
      const sym = normalizeSymbol(input.symbol);
      next = {
        ...next,
        quarantinedTickers: next.quarantinedTickers.filter((s) => s !== sym),
      };
      detail.symbol = sym;
      break;
    }
    case "reprocess_replay_window": {
      // Control plane does not rewrite history — reprocess is handled by the lib layer
      // and audited as a derived job. Controls state is unchanged.
      detail.note =
        "reprocess_delegated — creates derived session only; source frames immutable";
      break;
    }
    case "one_click_rollback": {
      next = {
        ...next,
        monitorGloballyDisabled: true,
        featureFlagCohort: "monitor-v1-rollback",
        leaderSelectionFrozen: false,
        frozenLeaderSymbol: null,
      };
      detail.note =
        "one_click_rollback — Monitor disabled; cohort set to monitor-v1-rollback; Feed/legacy remain available";
      break;
    }
    case "set_rollout_stage": {
      const cohort = normalizeId(input.cohortId, 80);
      next = { ...next, featureFlagCohort: cohort, monitorGloballyDisabled: false };
      detail.cohortId = cohort;
      detail.note =
        "stage_set — expansion gates must be re-attested before the next advance";
      break;
    }
    case "attest_expansion_gates": {
      // Gates persist in lib store; controls unchanged. Audit detail carries attestation.
      detail.note = "expansion_gates_attested";
      break;
    }
    default: {
      const _exhaustive: never = input.action;
      throw new MonitorOpsValidationError(`unknown_action:${_exhaustive}`);
    }
  }

  return { controls: sanitizeControls(next, nowMs), auditDetail: detail };
}

export function isProviderDisabled(
  controls: MonitorOpsControls,
  providerId: string
): boolean {
  return controls.disabledProviders.includes(providerId.trim().toLowerCase());
}

export function isCalculationVersionDisabled(
  controls: MonitorOpsControls,
  versionId: string
): boolean {
  return controls.disabledCalculationVersions.includes(versionId.trim());
}

export function isTickerQuarantined(
  controls: MonitorOpsControls,
  symbol: string
): boolean {
  return controls.quarantinedTickers.includes(symbol.trim().toUpperCase());
}
