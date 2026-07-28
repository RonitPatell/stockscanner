import type { CatalystItem } from "@/types";
import { buildSquawkScript } from "./script.ts";
import { computeSquawkPriority } from "./priority.ts";
import { meetsMinPriority } from "./priority.ts";
import { isInQuietHours } from "./quiet-hours.ts";
import type { SquawkSettings, SquawkUtterance } from "./types.ts";
import { detectRiskOnlyCatalyst } from "../alerts/modes.ts";
import { presentJudgment } from "../judgment/present.ts";

function sourceQuality(c: CatalystItem): string {
  const tier = (c.sourceTier ?? "").toLowerCase();
  if (tier === "wire" || tier === "exchange") return "primary wire";
  if (tier === "aggregator") return "aggregator";
  if (c.verifiedConfidence != null && c.verifiedConfidence >= 70) {
    return "verified secondary";
  }
  return "unverified or low confidence";
}

function verifiedFact(c: CatalystItem): string {
  const j = c.judgmentV2;
  if (j?.verifiedFacts?.length) {
    const f = j.verifiedFacts.find((x) => x?.trim());
    if (f) return f.slice(0, 160);
  }
  const presented = presentJudgment({ judgment: j ?? null });
  const type = c.catalystType ?? "catalyst";
  return [
    `${type.replace(/_/g, " ")} event`,
    `materiality ${presented.materiality.toLowerCase()}`,
    `direction ${presented.direction.toLowerCase()}`,
  ].join(", ");
}

function highestRisk(c: CatalystItem): string | null {
  const presented = presentJudgment({
    judgment: c.judgmentV2 ?? null,
    dilutionHint: /offering|dilution/i.test(c.catalystType ?? ""),
  });
  if (presented.topRisk) return presented.topRisk;
  const tags = c.setupTags ?? [];
  const risk = tags.find((t) => /dilution|offering|halt|trap|warrant/i.test(t));
  if (risk) return risk.replace(/_/g, " ");
  const detected = detectRiskOnlyCatalyst(c);
  if (detected.isRisk && detected.tags[0]) return detected.tags[0].replace(/_/g, " ");
  return null;
}

function tradeabilityLabel(c: CatalystItem): string | null {
  const t = presentJudgment({ judgment: c.judgmentV2 ?? null }).tradeability;
  return t === "Unknown" ? null : t.toLowerCase();
}

function contentFingerprint(c: CatalystItem): string {
  return [
    c.id,
    c.headline?.slice(0, 40),
    c.changePercent,
    c.rVol,
    c.judgmentV2?.grade,
    c.judgmentV2?.catalystStrength,
    (c.judgmentV2?.riskFlags ?? []).map((f) => f.id).join(","),
  ].join("|");
}

export function catalystToUtterance(
  c: CatalystItem,
  opts: {
    onWatchlist: boolean;
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
  if (settings.watchlistOnly && !opts.onWatchlist) {
    return { utterance: null, skipReason: "watchlist_only" };
  }

  const risk = detectRiskOnlyCatalyst(c);
  if (settings.riskOnly && !risk.isRisk) {
    return { utterance: null, skipReason: "risk_only" };
  }

  const pri = computeSquawkPriority({
    urgencyScore: c.urgencyScore,
    verifiedConfidence: c.verifiedConfidence,
    riskSeverity: risk.isRisk ? "high" : null,
    onWatchlist: opts.onWatchlist,
    isRiskCatalyst: risk.isRisk,
    absMovePct: c.changePercent != null ? Math.abs(c.changePercent) : null,
    rVol: c.rVol,
    grade: c.judgmentV2?.grade ?? null,
  });

  if (!meetsMinPriority(pri.level, settings.minPriority)) {
    return { utterance: null, skipReason: "below_min_priority" };
  }

  const script = buildSquawkScript({
    id: c.id,
    symbol: c.symbol,
    verifiedFact: verifiedFact(c),
    sourceQuality: sourceQuality(c),
    moveSincePublicationPct: c.changePercent ?? null,
    rVol: c.rVol ?? null,
    tradeability: tradeabilityLabel(c),
    highestRisk: highestRisk(c),
    storyClusterId: c.storyClusterId,
    contentFingerprint: contentFingerprint(c),
    // Ensure secrets never flow even if present on extended objects
    phoneNumber: null,
    email: null,
    webhookUrl: null,
    privateNote: null,
    headline: c.headline,
    aiSummary: c.aiSummary,
  });

  const utterance: SquawkUtterance = {
    id: `utt_${c.id}_${Date.now()}`,
    catalystId: c.id,
    symbol: c.symbol.toUpperCase(),
    storyClusterId: c.storyClusterId ?? null,
    contentFingerprint: contentFingerprint(c),
    script,
    priority: pri.level,
    priorityScore: pri.score,
    createdAt: opts.nowMs ?? Date.now(),
    isUpdate: false,
  };

  return { utterance, skipReason: null };
}
