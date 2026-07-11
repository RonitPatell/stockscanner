import { getCachedFeed } from "@/lib/feed-cache";
import { buildActionPlaybook, isDilutionCatalyst } from "@/lib/action-playbook";
import type { CatalystItem } from "@/types";

export interface SessionSetup {
  symbol: string;
  headline: string;
  bias: string;
  action: string;
  invalidation: string;
  conviction: number;
  antiFomoScore: number;
  changePercent: number | null | undefined;
}

export interface SessionSkip {
  symbol: string;
  headline: string;
  reason: string;
  antiFomoScore: number;
  changePercent: number | null | undefined;
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
    .map(({ c, playbook }) => ({
      symbol: c.symbol,
      headline: c.headline,
      bias: playbook.bias,
      action: playbook.action,
      invalidation: playbook.invalidation,
      conviction: playbook.conviction,
      antiFomoScore: playbook.antiFomoScore,
      changePercent: c.changePercent,
    }));

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
    .map(({ c, playbook }) => ({
      symbol: c.symbol,
      headline: c.headline,
      reason: playbook.action,
      antiFomoScore: playbook.antiFomoScore,
      changePercent: c.changePercent,
    }));

  return {
    generatedAt: new Date().toISOString(),
    setups,
    skips,
    mantra: "Trade the plan. Skip the trap. One good idea beats ten headlines.",
  };
}
