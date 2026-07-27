import { createHash } from "node:crypto";
import { HALT_MONITOR_VERSION } from "./version.ts";
import {
  codeImpliesNewsDisseminated,
  codeImpliesVolatilityPause,
  normalizeHaltCode,
} from "./codes.ts";
import type {
  HaltAlertTransition,
  HaltLifecycleStatus,
  HaltProviderEvent,
  HaltRecord,
  HaltTransitionRecord,
  NewsDisseminationStatus,
  ReconciliationStatus,
  HaltConfidence,
} from "./types.ts";

function sessionDateEt(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function newId(seed: string): string {
  return createHash("sha256").update(seed).digest("hex").slice(0, 24);
}

export function inferLifecycle(
  ev: HaltProviderEvent,
  prior: HaltLifecycleStatus | null
): HaltLifecycleStatus {
  if (ev.lifecycle) return ev.lifecycle;
  const code = normalizeHaltCode(ev.haltCode);
  const reason = (ev.haltReason ?? "").toLowerCase();

  if (
    /resum(e|ed|ing)/i.test(reason) ||
    code === "OTHER" && /resume/i.test(String(ev.rawPayload ?? ""))
  ) {
    if (/resume/.test(reason) && !/halt/.test(reason)) return "resumed";
  }
  if (ev.officialResumptionTradeAt && Date.parse(ev.officialResumptionTradeAt) <= Date.now()) {
    // Provider may say trade time passed — still need explicit resumed signal preferably
  }
  if (code === "T1") return "halted";
  if (code === "T2") return "news_disseminated";
  if (code === "T3" || ev.officialResumptionQuoteAt) {
    return "resumption_quote_scheduled";
  }
  if (codeImpliesVolatilityPause(code)) {
    return "halted";
  }
  return prior && prior !== "trading" && prior !== "resumed" ? prior : "halted";
}

export function lifecycleToAlert(
  from: HaltLifecycleStatus | null,
  to: HaltLifecycleStatus
): HaltAlertTransition | null {
  if (from === to) return null;
  if (to === "halted") {
    if (from === "resumed" || from === "trading" || from === "news_disseminated" || from === "resumption_quote_scheduled") {
      if (from === "resumed" || from === "trading" || from == null) return "HALTED";
      return "REHALTED";
    }
    if (from == null || from === "unknown") return "HALTED";
    return "REHALTED";
  }
  if (to === "news_disseminated") return "NEWS_RELEASED";
  if (to === "resumption_quote_scheduled") return "RESUMPTION_QUOTE_SCHEDULED";
  if (to === "resumed" || to === "trading") return "RESUMED";
  return null;
}

export function mergeNewsStatus(
  ev: HaltProviderEvent,
  prior: NewsDisseminationStatus
): NewsDisseminationStatus {
  if (ev.newsDisseminationStatus) return ev.newsDisseminationStatus;
  if (codeImpliesNewsDisseminated(ev.haltCode)) return "disseminated";
  if (normalizeHaltCode(ev.haltCode) === "T1") return "pending";
  if (codeImpliesVolatilityPause(ev.haltCode)) return "not_applicable";
  return prior;
}

/**
 * Reconcile official + licensed events for one symbol into an authoritative record.
 * Official exchange wins for resumption times and halt codes when present.
 * Licensed LULD can detect pauses earlier but cannot invent official resume clocks.
 */
export function reconcileHaltEvents(input: {
  symbol: string;
  events: HaltProviderEvent[];
  prior: HaltRecord | null;
  nowMs?: number;
}): {
  record: HaltRecord;
  transition: HaltTransitionRecord | null;
  disagreements: string[];
  alert: HaltAlertTransition | null;
} {
  const symbol = input.symbol.toUpperCase();
  const events = [...input.events]
    .filter((e) => e.symbol.toUpperCase() === symbol)
    .sort((a, b) => Date.parse(a.eventAt) - Date.parse(b.eventAt));

  const disagreements: string[] = [];
  if (events.length === 0) {
    throw new Error("reconcileHaltEvents requires events");
  }

  const official = [...events].reverse().find((e) => e.sourceKind === "official_exchange");
  const licensed = [...events].reverse().find((e) => e.sourceKind === "licensed_luld");
  const latest = events[events.length - 1]!;

  if (official && licensed) {
    if (
      normalizeHaltCode(official.haltCode) !== normalizeHaltCode(licensed.haltCode) &&
      !codeImpliesVolatilityPause(licensed.haltCode)
    ) {
      disagreements.push(
        `code_mismatch:official=${official.haltCode};licensed=${licensed.haltCode}`
      );
    }
    const oLife = inferLifecycle(official, input.prior?.lifecycle ?? null);
    const lLife = inferLifecycle(licensed, input.prior?.lifecycle ?? null);
    if (oLife !== lLife && oLife !== "unknown" && lLife !== "unknown") {
      disagreements.push(`lifecycle_mismatch:official=${oLife};licensed=${lLife}`);
    }
  }

  const primary = official ?? latest;
  const prior = input.prior;
  const lifecycle = inferLifecycle(primary, prior?.lifecycle ?? null);

  // Official resumption times ONLY from official_exchange events — never from licensed
  let quoteAt: string | null = prior?.officialResumptionQuoteAt ?? null;
  let tradeAt: string | null = prior?.officialResumptionTradeAt ?? null;
  if (official) {
    if (official.officialResumptionQuoteAt) quoteAt = official.officialResumptionQuoteAt;
    if (official.officialResumptionTradeAt) tradeAt = official.officialResumptionTradeAt;
  }
  // Explicit clear only if official says resumed without times is ok — keep prior times for history

  let reconciliationStatus: ReconciliationStatus = "single_source";
  let confidence: HaltConfidence = official ? "high" : licensed ? "medium" : "low";
  if (official && licensed) {
    reconciliationStatus = disagreements.length ? "disagreement" : "agreed";
    if (disagreements.length) {
      reconciliationStatus = "official_preferred";
      confidence = "medium";
    }
  }

  const haltStartAt =
    prior?.haltStartAt &&
    (lifecycle === "halted" ||
      lifecycle === "news_disseminated" ||
      lifecycle === "resumption_quote_scheduled")
      ? prior.haltStartAt
      : primary.eventAt;

  const id =
    prior?.id ??
    newId(`${symbol}|${haltStartAt}|${sessionDateEt(haltStartAt)}`);

  const record: HaltRecord = {
    id,
    symbol,
    exchange: primary.exchange ?? prior?.exchange ?? null,
    haltCode: normalizeHaltCode(primary.haltCode),
    haltReason: primary.haltReason ?? prior?.haltReason ?? null,
    haltStartAt,
    newsDisseminationStatus: mergeNewsStatus(
      primary,
      prior?.newsDisseminationStatus ?? "unknown"
    ),
    officialResumptionQuoteAt: quoteAt,
    officialResumptionTradeAt: tradeAt,
    lastPriceBeforeHalt:
      primary.lastPriceBeforeHalt ?? prior?.lastPriceBeforeHalt ?? null,
    lastSpreadBeforeHalt:
      primary.lastSpreadBeforeHalt ?? prior?.lastSpreadBeforeHalt ?? null,
    volumeBeforeHalt: primary.volumeBeforeHalt ?? prior?.volumeBeforeHalt ?? null,
    catalystIds: prior?.catalystIds ?? [],
    filingOrNewsIds: prior?.filingOrNewsIds ?? [],
    source: primary.source,
    sourceKind: primary.sourceKind,
    sourceTimestamp: primary.sourceTimestamp,
    confidence,
    reconciliationStatus,
    lifecycle,
    sessionDateEt: sessionDateEt(haltStartAt),
    monitorVersion: HALT_MONITOR_VERSION,
    updatedAt: new Date(input.nowMs ?? Date.now()).toISOString(),
  };

  const from = prior?.lifecycle ?? null;
  let alert = lifecycleToAlert(from, lifecycle);

  // T1 → T2 should always NEWS_RELEASED even if inferLifecycle already news
  if (
    prior &&
    normalizeHaltCode(prior.haltCode) === "T1" &&
    normalizeHaltCode(record.haltCode) === "T2"
  ) {
    alert = "NEWS_RELEASED";
    record.lifecycle = "news_disseminated";
    record.newsDisseminationStatus = "disseminated";
  }

  // Re-halt: resumed/trading → halted again
  if (
    prior &&
    (prior.lifecycle === "resumed" || prior.lifecycle === "trading") &&
    lifecycle === "halted"
  ) {
    alert = "REHALTED";
  }

  let transition: HaltTransitionRecord | null = null;
  if (alert) {
    transition = {
      id: newId(`${id}|${alert}|${primary.eventAt}|${primary.source}`),
      haltId: id,
      symbol,
      fromLifecycle: from,
      toLifecycle: record.lifecycle,
      alertTransition: alert,
      haltCode: record.haltCode,
      at: primary.eventAt,
      source: primary.source,
      sourceKind: primary.sourceKind,
      detail: disagreements.length
        ? `Reconciled with disagreements: ${disagreements.join("; ")}`
        : `${from ?? "none"} → ${record.lifecycle}`,
      suppressedDuplicate: false,
    };
  }

  return { record, transition, disagreements, alert };
}

/**
 * Apply events possibly out of order — sort by eventAt then reconcile chronologically.
 */
export function applyEventStream(input: {
  symbol: string;
  events: HaltProviderEvent[];
  prior: HaltRecord | null;
}): {
  record: HaltRecord;
  transitions: HaltTransitionRecord[];
  disagreements: string[];
} {
  const sorted = [...input.events].sort(
    (a, b) => Date.parse(a.eventAt) - Date.parse(b.eventAt)
  );
  let prior = input.prior;
  const transitions: HaltTransitionRecord[] = [];
  const disagreements: string[] = [];
  let record = prior;

  // Group by timestamp buckets to reconcile multi-provider same moment
  const buckets = new Map<string, HaltProviderEvent[]>();
  for (const ev of sorted) {
    const key = `${ev.symbol}|${ev.eventAt}`;
    const arr = buckets.get(key) ?? [];
    arr.push(ev);
    buckets.set(key, arr);
  }

  for (const [, group] of buckets) {
    const r = reconcileHaltEvents({
      symbol: input.symbol,
      events: group,
      prior,
    });
    prior = r.record;
    record = r.record;
    if (r.transition) transitions.push(r.transition);
    disagreements.push(...r.disagreements);
  }

  if (!record) {
    throw new Error("applyEventStream produced no record");
  }
  return { record, transitions, disagreements };
}

export function formatResumptionTime(iso: string | null | undefined): string {
  if (!iso) return "not yet announced";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }) + " ET";
}
