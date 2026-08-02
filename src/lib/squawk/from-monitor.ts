import type {
  MonitorTapeEventType,
  MonitorTapeItem,
  TapeSeverity,
} from "../../domain/monitor/event-tape/types.ts";
import { isInQuietHours } from "./quiet-hours.ts";
import { buildMonitorSquawkScript } from "./monitor-script.ts";
import { meetsMinPriority } from "./priority.ts";
import type { SquawkPriorityLevel, SquawkSettings, SquawkUtterance } from "./types.ts";

/** High-value Monitor transitions eligible for speech. */
export const MONITOR_SQUAWK_EVENT_TYPES = [
  "VERIFIED_CATALYST",
  "MOMENTUM_BREAKING",
  "HALTED",
  "NEWS_RELEASED_DURING_HALT",
  "RESUMPTION_SCHEDULED",
  "RESUMED",
  "DILUTION_RISK",
  "OFFERING",
  "DATA_DEGRADED",
  /** Synthetic — attention leader change (not a tape type). */
  "ATTENTION_LEADER",
] as const;

export type MonitorSquawkEventType =
  | (typeof MONITOR_SQUAWK_EVENT_TYPES)[number]
  | MonitorTapeEventType;

export interface MonitorSquawkEventInput {
  id: string;
  symbol: string;
  type: MonitorSquawkEventType;
  /** Structured event phrase — never raw article body */
  eventPhrase: string;
  momentumState?: string | null;
  riskOrTradeability?: string | null;
  severity?: TapeSeverity | SquawkPriorityLevel | null;
  clusterId?: string | null;
  contentFingerprint?: string | null;
  onWatchlist: boolean;
  strategyMatch: boolean;
  /** When true, attention leader change is meaningful enough to speak */
  meaningfulLeaderChange?: boolean;
}

const HIGH_VALUE = new Set<string>(MONITOR_SQUAWK_EVENT_TYPES);

export function isHighValueMonitorSquawkType(type: string): boolean {
  return HIGH_VALUE.has(type);
}

export function monitorEventPriority(
  type: MonitorSquawkEventType,
  severity?: TapeSeverity | SquawkPriorityLevel | null
): SquawkPriorityLevel {
  if (type === "HALTED" || type === "OFFERING" || type === "NEWS_RELEASED_DURING_HALT") {
    return "critical";
  }
  if (type === "DATA_DEGRADED") {
    // Only critical data degradation is spoken — force critical for this gated type
    return "critical";
  }
  if (type === "DILUTION_RISK") {
    if (severity === "critical" || severity === "high") return "high";
    return "normal"; // may be filtered by minPriority / high-severity gate
  }
  if (
    type === "VERIFIED_CATALYST" ||
    type === "MOMENTUM_BREAKING" ||
    type === "RESUMED" ||
    type === "RESUMPTION_SCHEDULED" ||
    type === "ATTENTION_LEADER"
  ) {
    return "high";
  }
  if (severity === "critical") return "critical";
  if (severity === "high") return "high";
  return "normal";
}

function eventPhraseFromTape(item: MonitorTapeItem): string {
  switch (item.type) {
    case "VERIFIED_CATALYST":
      return "Verified material catalyst";
    case "MOMENTUM_BREAKING":
      return "Momentum breaking";
    case "HALTED":
    case "NEWS_RELEASED_DURING_HALT":
      return "halted";
    case "RESUMPTION_SCHEDULED":
      return "Resumption scheduled";
    case "RESUMED":
      return "resumed";
    case "DILUTION_RISK":
      return "High-severity dilution risk";
    case "OFFERING":
      return "Offering event";
    case "DATA_DEGRADED":
      return "Critical data degradation";
    default:
      return item.label;
  }
}

function riskFromTape(item: MonitorTapeItem): string | null {
  if (item.type === "NEWS_RELEASED_DURING_HALT") {
    return "Offering news released during the halt";
  }
  if (item.type === "MOMENTUM_BREAKING") {
    return null; // momentum already in event / state slot
  }
  if (item.type === "DILUTION_RISK") return "Dilution risk flagged";
  if (item.type === "OFFERING") return "Offering disclosure linked";
  if (item.type === "DATA_DEGRADED") {
    return "Market data quality degraded";
  }
  if (item.type === "HALTED") {
    return null;
  }
  if (item.type === "VERIFIED_CATALYST") {
    return null;
  }
  return null;
}

/**
 * Map a tape item into a Monitor squawk event input (or null if not high-value).
 */
export function tapeItemToMonitorSquawkInput(
  item: MonitorTapeItem,
  opts: { onWatchlist: boolean; strategyMatch: boolean; momentumState?: string | null }
): MonitorSquawkEventInput | null {
  if (!isHighValueMonitorSquawkType(item.type)) return null;

  // Dilution: high-severity only
  if (item.type === "DILUTION_RISK" && item.severity !== "high" && item.severity !== "critical") {
    return null;
  }

  // Data degradation: critical path only (gate by confidence or severity)
  if (item.type === "DATA_DEGRADED") {
    const critical =
      item.severity === "critical" ||
      item.dataConfidence === "degraded" ||
      item.dataConfidence === "low";
    if (!critical) return null;
  }

  let momentumState = opts.momentumState ?? null;
  if (item.type === "MOMENTUM_BREAKING") momentumState = "breaking";

  return {
    id: item.id,
    symbol: item.symbol,
    type: item.type,
    eventPhrase: eventPhraseFromTape(item),
    momentumState,
    riskOrTradeability: riskFromTape(item),
    severity: item.severity,
    clusterId: item.clusterId,
    contentFingerprint: `${item.type}|${item.fingerprint}|${item.severity}`,
    onWatchlist: opts.onWatchlist,
    strategyMatch: opts.strategyMatch,
  };
}

export function attentionLeaderToMonitorSquawkInput(opts: {
  symbol: string;
  previousSymbol: string | null;
  momentumState?: string | null;
  riskOrTradeability?: string | null;
  onWatchlist: boolean;
  strategyMatch: boolean;
  meaningful: boolean;
  nowMs?: number;
}): MonitorSquawkEventInput | null {
  if (!opts.meaningful) return null;
  if (!opts.symbol) return null;
  if (opts.previousSymbol && opts.previousSymbol === opts.symbol) return null;

  return {
    id: `attn_leader_${opts.symbol}_${opts.nowMs ?? Date.now()}`,
    symbol: opts.symbol,
    type: "ATTENTION_LEADER",
    eventPhrase: "New attention leader",
    momentumState: opts.momentumState ?? null,
    riskOrTradeability: opts.riskOrTradeability ?? null,
    severity: "high",
    clusterId: `attn_leader_${opts.symbol}`,
    contentFingerprint: `ATTENTION_LEADER|${opts.symbol}|${opts.previousSymbol ?? "none"}`,
    onWatchlist: opts.onWatchlist,
    strategyMatch: opts.strategyMatch,
    meaningfulLeaderChange: true,
  };
}

/**
 * Convert a Monitor high-value event into a speakable utterance.
 * Respects quiet hours, watchlist-only, strategy-match, mute, min priority.
 * Never passes private notes / contacts / webhooks into the script.
 */
export function monitorEventToUtterance(
  event: MonitorSquawkEventInput,
  opts: {
    settings: SquawkSettings;
    nowMs?: number;
  }
): { utterance: SquawkUtterance | null; skipReason: string | null } {
  const { settings } = opts;

  if (!settings.enabled || settings.muted) {
    return { utterance: null, skipReason: "disabled_or_muted" };
  }
  if (isInQuietHours(settings.quietHours, opts.nowMs)) {
    return { utterance: null, skipReason: "quiet_hours" };
  }
  if (settings.watchlistOnly && !event.onWatchlist) {
    return { utterance: null, skipReason: "watchlist_only" };
  }
  if (settings.strategyMatchOnly && !event.strategyMatch) {
    return { utterance: null, skipReason: "strategy_match_only" };
  }
  if (!isHighValueMonitorSquawkType(event.type)) {
    return { utterance: null, skipReason: "not_high_value" };
  }
  if (event.type === "ATTENTION_LEADER" && !event.meaningfulLeaderChange) {
    return { utterance: null, skipReason: "leader_not_meaningful" };
  }
  if (
    event.type === "DILUTION_RISK" &&
    event.severity !== "high" &&
    event.severity !== "critical"
  ) {
    return { utterance: null, skipReason: "dilution_not_high_severity" };
  }

  const priority = monitorEventPriority(event.type, event.severity);
  if (!meetsMinPriority(priority, settings.minPriority)) {
    return { utterance: null, skipReason: "below_min_priority" };
  }

  const script = buildMonitorSquawkScript({
    symbol: event.symbol,
    eventPhrase: event.eventPhrase,
    momentumState: event.momentumState,
    riskOrTradeability: event.riskOrTradeability,
  });

  const fingerprint =
    event.contentFingerprint ??
    `${event.type}|${event.symbol}|${event.eventPhrase}`;

  const utterance: SquawkUtterance = {
    id: `utt_mon_${event.id}`,
    catalystId: event.id,
    symbol: event.symbol.toUpperCase(),
    storyClusterId: event.clusterId ?? `mon_${event.symbol}_${event.type}`,
    contentFingerprint: fingerprint,
    script,
    priority,
    priorityScore:
      priority === "critical"
        ? 95
        : priority === "high"
          ? 80
          : priority === "normal"
            ? 55
            : 35,
    createdAt: opts.nowMs ?? Date.now(),
    isUpdate: false,
  };

  return { utterance, skipReason: null };
}
