import type { CatalystItem } from "@/types";
import { projectDecisionCardV3 } from "../decision-card/project.ts";
import { confidenceLabel } from "../source-trust.ts";
import {
  inferDirectionalImplication,
  presentJudgment,
} from "../judgment/present.ts";
import { buildJudgmentV2 } from "../judgment/build-v2.ts";
import type {
  DirectionalImplication,
  FeedV3DisplayPrefs,
} from "./version.ts";
import { DEFAULT_FEED_V3_PREFS } from "./version.ts";

export interface CatalystFeedRowV3Model {
  id: string;
  symbol: string;
  changePercent: number | null;
  price: number | null;
  direction: DirectionalImplication;
  materialityLabel: string;
  ageLabel: string;
  ageMinutes: number | null;
  headline: string;
  verificationLabel: string;
  reactionStageLabel: string;
  tradeabilityLabel: string;
  topRiskLabel: string | null;
  inWatchlist: boolean;
  muted: boolean;
  /** Optional advanced columns */
  extras: {
    floatLabel: string | null;
    marketCapLabel: string | null;
    sentimentScore: number | null;
    gapper: boolean;
    allRiskLabels: string[];
    internalSource: string | null;
    /** Legacy grade — only when advanced pref on; never primary */
    gradeLabel: string | null;
  };
  /** Fingerprint of display-relevant fields for SSE merge */
  presentationFingerprint: string;
}

function ageParts(
  publishedAt: string,
  nowMs: number
): { label: string; minutes: number | null } {
  const t = Date.parse(publishedAt);
  if (!Number.isFinite(t)) return { label: "—", minutes: null };
  const sec = Math.max(0, Math.floor((nowMs - t) / 1000));
  const minutes = sec / 60;
  if (sec < 60) return { label: `${sec}s`, minutes };
  if (sec < 3600) return { label: `${Math.floor(sec / 60)}m`, minutes };
  if (sec < 86400) return { label: `${Math.floor(sec / 3600)}h`, minutes };
  return { label: `${Math.floor(sec / 86400)}d`, minutes };
}

function verificationLabel(c: CatalystItem, modelConfidence: string | null): string {
  const conf = confidenceLabel(c.verifiedConfidence);
  if (conf === "High confidence" || (c.verifiedConfidence ?? 0) >= 70) {
    return "Verified";
  }
  if (conf === "Verified" || (c.verifiedConfidence ?? 0) >= 45) {
    return "Verified";
  }
  if (modelConfidence) return modelConfidence;
  if ((c.verifiedConfidence ?? 0) >= 25) return "Likely";
  return "Unverified";
}

function formatFloat(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B float`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M float`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K float`;
  return `${n} float`;
}

function formatMcap(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  if (n >= 1e9) return `$${((n as number) / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${((n as number) / 1e6).toFixed(0)}M`;
  return `$${Math.round(n as number)}`;
}

/**
 * Project a catalyst into the collapsed Feed V3 row model.
 * Uses existing Decision Card / Judgment fields — no reclassification.
 */
export function projectCatalystFeedRowV3(
  c: CatalystItem,
  opts: {
    nowMs?: number;
    inWatchlist?: boolean;
    muted?: boolean;
    prefs?: FeedV3DisplayPrefs;
  } = {}
): CatalystFeedRowV3Model {
  const nowMs = opts.nowMs ?? Date.now();
  const prefs = opts.prefs ?? DEFAULT_FEED_V3_PREFS;
  const model = projectDecisionCardV3(c, { nowMs });
  const age = ageParts(c.publishedAt, nowMs);
  const activeRisks = model.risks
    .filter((r) => r.active)
    .sort((a, b) => {
      const rank = { high: 3, medium: 2, low: 1 };
      return (rank[b.severity] ?? 0) - (rank[a.severity] ?? 0);
    });
  const judgment = c.judgmentV2 ?? buildJudgmentV2(c);
  const directionFallback = inferDirectionalImplication(c);
  const presented = presentJudgment({
    judgment,
    directionalImplication: directionFallback,
    reactionStage: model.reactionStage.stage,
    tradeability: model.tradeability.liquidity,
    riskFlags: activeRisks.map((r) => ({
      id: r.id,
      label: r.label,
      severity: r.severity,
      detail: r.detail,
    })),
  });
  const direction = presented.direction;
  const headline = model.catalyst.factSummary || c.headline;
  const ver = verificationLabel(c, null);
  const stage =
    presented.reactionStage === "Early"
      ? "Early reaction"
      : presented.reactionStage === "Active"
        ? "Active reaction"
        : presented.reactionStage;
  const trade = presented.tradeability;
  const riskText =
    presented.topRisk ??
    (activeRisks.length === 0 ? "No major capital risk" : null);
  const materialityLabel = presented.materiality;

  const fp = [
    c.id,
    c.symbol,
    c.changePercent ?? "",
    c.price ?? "",
    direction,
    materialityLabel,
    headline.slice(0, 80),
    ver,
    stage,
    trade,
    riskText ?? "",
    opts.inWatchlist ? "1" : "0",
    c.publishedAt,
  ].join("|");

  return {
    id: c.id,
    symbol: c.symbol.toUpperCase(),
    changePercent: c.changePercent ?? null,
    price: c.price ?? null,
    direction,
    materialityLabel,
    ageLabel: age.label,
    ageMinutes: age.minutes,
    headline: headline.slice(0, 160),
    verificationLabel: ver,
    reactionStageLabel: stage,
    tradeabilityLabel: trade,
    topRiskLabel: riskText,
    inWatchlist: Boolean(opts.inWatchlist),
    muted: Boolean(opts.muted),
    extras: {
      floatLabel: prefs.showFloat
        ? formatFloat(
            c.floatShares ??
              (model.tradeability.floatShares.availability === "ok"
                ? model.tradeability.floatShares.value
                : null)
          )
        : null,
      marketCapLabel: prefs.showMarketCap ? formatMcap(c.marketCap) : null,
      sentimentScore: prefs.showSentimentScore ? (c.sentimentScore ?? null) : null,
      gapper:
        prefs.showGapperLabel &&
        Boolean(c.setupTags?.some((t) => t.toLowerCase() === "gapper")),
      allRiskLabels: prefs.showAllRisks
        ? activeRisks.map((r) => r.label)
        : [],
      internalSource: prefs.showInternalSourceName ? (c.source ?? null) : null,
      gradeLabel: prefs.showGradeColumn
        ? `Legacy ${c.judgmentV2?.grade ?? "—"} (compat)`
        : null,
    },
    presentationFingerprint: fp,
  };
}

/** Merge SSE payloads — only replace rows whose presentation fingerprint changed. */
export function mergeFeedByPresentation(
  prev: CatalystItem[],
  incoming: CatalystItem[],
  opts: { nowMs?: number } = {}
): { next: CatalystItem[]; changedIds: string[] } {
  const nowMs = opts.nowMs ?? Date.now();
  const prevMap = new Map(prev.map((c) => [c.id, c]));
  const changedIds: string[] = [];
  const next: CatalystItem[] = [];

  for (const c of incoming) {
    const old = prevMap.get(c.id);
    if (!old) {
      changedIds.push(c.id);
      next.push(c);
      continue;
    }
    const a = projectCatalystFeedRowV3(old, { nowMs }).presentationFingerprint;
    const b = projectCatalystFeedRowV3(c, { nowMs }).presentationFingerprint;
    if (a !== b) {
      changedIds.push(c.id);
      next.push(c);
    } else {
      // Keep previous object identity when unchanged to reduce React work
      next.push(old);
    }
  }
  return { next, changedIds };
}
