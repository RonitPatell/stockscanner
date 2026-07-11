import { NextResponse } from "next/server";
import { getCachedFeed } from "@/lib/feed-cache";
import { buildActionPlaybook } from "@/lib/action-playbook";
import { isDilutionCatalyst } from "@/lib/action-playbook";
import type { CatalystItem } from "@/types";

export const dynamic = "force-dynamic";

/** Session plan: 3 setups, 2 skips — anti-FOMO morning card. */
export async function GET() {
  const { items } = await getCachedFeed("all");
  const recent = items.slice(0, 80);

  const scored = recent.map((c: CatalystItem) => {
    const playbook = buildActionPlaybook(c);
    return { c, playbook };
  });

  const setups = scored
    .filter(
      ({ playbook, c }) =>
        (playbook.bias === "long" || playbook.bias === "short") &&
        playbook.antiFomoScore < 70 &&
        Math.abs(c.changePercent ?? 0) >= 1.5
    )
    .sort((a, b) => b.playbook.conviction - a.playbook.conviction)
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

  const skips = scored
    .filter(
      ({ playbook, c }) =>
        playbook.bias === "avoid" ||
        playbook.antiFomoScore >= 75 ||
        isDilutionCatalyst(c)
    )
    .slice(0, 2)
    .map(({ c, playbook }) => ({
      symbol: c.symbol,
      headline: c.headline,
      reason: playbook.action,
      antiFomoScore: playbook.antiFomoScore,
      changePercent: c.changePercent,
    }));

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    setups,
    skips,
    mantra: "Trade the plan. Skip the trap. One good idea beats ten headlines.",
  });
}
