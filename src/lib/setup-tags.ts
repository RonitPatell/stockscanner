import type { CatalystItem } from "@/types";

export const SETUP_TAGS = [
  { id: "gapper", label: "Gapper", icon: "🚀" },
  { id: "sympathy", label: "Sympathy", icon: "🔗" },
  { id: "sector_momentum", label: "Sector", icon: "📈" },
  { id: "earnings_soon", label: "Earnings soon", icon: "📅" },
  { id: "hod_break", label: "HOD break", icon: "⬆️" },
  { id: "heavy_volume", label: "Heavy vol", icon: "🔥" },
] as const;

export type SetupTagId = (typeof SETUP_TAGS)[number]["id"];

export function detectSetupTags(c: {
  symbol: string;
  changePercent?: number | null;
  rVol?: number | null;
  catalystType?: string | null;
  relatedSymbols?: string[];
  isPremarket?: boolean;
  earningsInDays?: number | null;
}): SetupTagId[] {
  const tags: SetupTagId[] = [];
  const move = Math.abs(c.changePercent ?? 0);
  const rvol = c.rVol ?? 0;

  if (move >= 5 && (c.isPremarket || move >= 8)) tags.push("gapper");
  if (rvol >= 4 || move >= 6) tags.push("heavy_volume");
  if (c.relatedSymbols && c.relatedSymbols.length >= 2) tags.push("sympathy");
  if (c.catalystType === "macro" || (c.relatedSymbols?.length ?? 0) >= 3) {
    tags.push("sector_momentum");
  }
  if (c.earningsInDays != null && c.earningsInDays >= 0 && c.earningsInDays <= 5) {
    tags.push("earnings_soon");
  }
  if (move >= 3 && rvol >= 2.5) tags.push("hod_break");

  return [...new Set(tags)];
}

export function setupTagMeta(id: string) {
  return SETUP_TAGS.find((t) => t.id === id);
}

export function enrichCatalystWithSetupTags<T extends CatalystItem>(
  c: T,
  sectorMoves?: Map<string, number>
): T & { setupTags: string[] } {
  const sectorAvg = sectorMoves?.get(c.symbol);
  const sympathy =
    sectorAvg != null && Math.abs(c.changePercent ?? 0) < Math.abs(sectorAvg) * 0.6 && sectorAvg >= 3;

  const tags = detectSetupTags({
    symbol: c.symbol,
    changePercent: c.changePercent,
    rVol: c.rVol,
    catalystType: c.catalystType,
    relatedSymbols: c.relatedSymbols,
    isPremarket: c.isPremarket,
  });

  if (sympathy && !tags.includes("sympathy")) tags.push("sympathy");

  return { ...c, setupTags: tags };
}
