import { getCachedFeed } from "@/lib/feed-cache";
import { buildActionPlaybook, isDilutionCatalyst } from "@/lib/action-playbook";
import { presentJudgment, presentSessionBias } from "@/lib/judgment/present";
import type { CatalystItem } from "@/types";

export interface SessionSetup {
  symbol: string;
  headline: string;
  /** Legacy playbook bias — kept for API compatibility */
  bias: string;
  action: string;
  invalidation: string;
  conviction: number;
  antiFomoScore: number;
  changePercent: number | null | undefined;
  /** Presentation dimensions — not buy/sell instructions */
  directionLabel: string;
  reviewLabel: string;
  materialityLabel: string;
  tradeabilityLabel: string;
  topRiskLabel: string | null;
}

export interface SessionSkip {
  symbol: string;
  headline: string;
  reason: string;
  antiFomoScore: number;
  changePercent: number | null | undefined;
  directionLabel: string;
  reviewLabel: string;
  materialityLabel: string;
  topRiskLabel: string | null;
}

export interface SessionPlan {
  generatedAt: string;
  setups: SessionSetup[];
  skips: SessionSkip[];
  mantra: string;
}

/** Keep first occurrence per symbol (caller should sort preferred-first). */
function uniqueBySymbol<T extends { c: CatalystItem }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const sym = row.c.symbol.toUpperCase();
    if (seen.has(sym)) continue;
    seen.add(sym);
    out.push(row);
  }
  return out;
}

function presentSetup(c: CatalystItem, bias: string, action: string) {
  const biasP = presentSessionBias(bias);
  const p = presentJudgment({
    judgment: c.judgmentV2 ?? null,
    dilutionHint: isDilutionCatalyst(c),
  });
  return {
    directionLabel: biasP.direction !== "Unclear" ? biasP.direction : p.direction,
    reviewLabel: biasP.reviewLabel,
    materialityLabel: p.materiality,
    tradeabilityLabel: p.tradeability,
    topRiskLabel: p.topRisk,
    actionDisplay: action
      .replace(/\bLong bias\b/gi, "Positive direction")
      .replace(/\bShort bias\b/gi, "Negative direction")
      .replace(/\bSkip \/ Fade bias\b/gi, "Capital caution")
      .replace(/\bprefer short\b/gi, "watch for failed reclaim")
      .replace(/\bTrade with the news\b/gi, "Review with the news impulse"),
  };
}

export async function buildSessionPlan(): Promise<SessionPlan> {
  const { items } = await getCachedFeed("all");
  const recent = items.slice(0, 80) as CatalystItem[];

  const scored = recent.map((c) => ({ c, playbook: buildActionPlaybook(c) }));

  const setups = uniqueBySymbol(
    scored
      .filter(
        ({ playbook, c }) =>
          (playbook.bias === "long" || playbook.bias === "short") &&
          playbook.antiFomoScore < 70 &&
          Math.abs(c.changePercent ?? 0) >= 1.5
      )
      .sort((a, b) => b.playbook.conviction - a.playbook.conviction)
  )
    .slice(0, 3)
    .map(({ c, playbook }) => {
      const p = presentSetup(c, playbook.bias, playbook.action);
      return {
        symbol: c.symbol,
        headline: c.headline,
        bias: playbook.bias,
        action: p.actionDisplay,
        invalidation: playbook.invalidation,
        conviction: playbook.conviction,
        antiFomoScore: playbook.antiFomoScore,
        changePercent: c.changePercent,
        directionLabel: p.directionLabel,
        reviewLabel: p.reviewLabel,
        materialityLabel: p.materialityLabel,
        tradeabilityLabel: p.tradeabilityLabel,
        topRiskLabel: p.topRiskLabel,
      };
    });

  const setupSymbols = new Set(setups.map((s) => s.symbol.toUpperCase()));

  const skips = uniqueBySymbol(
    scored
      .filter(
        ({ playbook, c }) =>
          !setupSymbols.has(c.symbol.toUpperCase()) &&
          (playbook.bias === "avoid" ||
            playbook.antiFomoScore >= 75 ||
            isDilutionCatalyst(c))
      )
      .sort((a, b) => b.playbook.antiFomoScore - a.playbook.antiFomoScore)
  )
    .slice(0, 2)
    .map(({ c, playbook }) => {
      const p = presentSetup(c, "avoid", playbook.action);
      return {
        symbol: c.symbol,
        headline: c.headline,
        reason: p.actionDisplay,
        antiFomoScore: playbook.antiFomoScore,
        changePercent: c.changePercent,
        directionLabel: p.directionLabel,
        reviewLabel: p.reviewLabel,
        materialityLabel: p.materialityLabel,
        topRiskLabel: p.topRiskLabel,
      };
    });

  return {
    generatedAt: new Date().toISOString(),
    setups,
    skips,
    mantra:
      "Review material events. Separate direction from attention. Prefer caution over FOMO.",
  };
}
