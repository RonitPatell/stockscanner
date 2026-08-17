import { prisma } from "@/lib/prisma";
import { getDilutionTimeline } from "@/lib/dilution/timeline";
import { getCatalystsForSymbol } from "@/lib/speed-wins";

export type TickerHubFiling = {
  id: string;
  formHint: string;
  headline: string;
  publishedAt: Date;
  sourceUrl: string | null;
  kind: "form4" | "8k" | "capital" | "other";
};

export type TickerHubBundle = {
  symbol: string;
  catalysts: Awaited<ReturnType<typeof getCatalystsForSymbol>>;
  filings: TickerHubFiling[];
  form4: TickerHubFiling[];
  dilution: {
    active: boolean;
    count: number;
    latestWhy: string | null;
    status: string | null;
  };
  edgarSearchUrl: string;
};

function classifyHeadline(headline: string, catalystType: string | null): TickerHubFiling["kind"] {
  const h = headline.toLowerCase();
  const t = (catalystType ?? "").toLowerCase();
  if (h.includes("form 4") || h.includes("form-4") || t.includes("form_4") || t === "4") {
    return "form4";
  }
  if (h.includes("8-k") || h.includes("8k") || t.includes("8-k") || t === "8k") {
    return "8k";
  }
  if (
    h.includes("424b") ||
    h.includes("offering") ||
    h.includes("s-1") ||
    h.includes("s-3") ||
    h.includes("atm") ||
    t.includes("offering") ||
    t.includes("dilution")
  ) {
    return "capital";
  }
  return "other";
}

function formHint(kind: TickerHubFiling["kind"], headline: string): string {
  if (kind === "form4") return "Form 4";
  if (kind === "8k") return "8-K";
  if (kind === "capital") {
    if (/424b/i.test(headline)) return "424B";
    if (/s-1/i.test(headline)) return "S-1";
    if (/s-3/i.test(headline)) return "S-3";
    return "Capital";
  }
  return "Filing";
}

/**
 * Public ticker hub bundle — no secrets, session-agnostic.
 * Dilution timeline is public market structure data from our extract pipeline.
 */
export async function getTickerHubBundle(symbol: string): Promise<TickerHubBundle> {
  const sym = symbol.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5);
  const [catalysts, timeline] = await Promise.all([
    getCatalystsForSymbol(sym, 40).catch(() => []),
    getDilutionTimeline(sym, 12).catch(() => []),
  ]);

  const filings: TickerHubFiling[] = catalysts.map((c) => {
    const kind = classifyHeadline(c.headline, c.catalystType);
    return {
      id: c.id,
      formHint: formHint(kind, c.headline),
      headline: c.headline,
      publishedAt: c.publishedAt,
      sourceUrl: c.sourceUrl ?? null,
      kind,
    };
  });

  const form4 = filings.filter((f) => f.kind === "form4").slice(0, 12);
  const capitalOrSec = filings
    .filter((f) => f.kind === "8k" || f.kind === "capital" || f.kind === "other")
    .slice(0, 20);

  const active = timeline.some(
    (t) => t.status === "active" || t.status === "pending"
  );

  return {
    symbol: sym,
    catalysts,
    filings: capitalOrSec,
    form4,
    dilution: {
      active: active || timeline.length > 0,
      count: timeline.length,
      latestWhy: timeline[0]?.capacityNote ?? timeline[0]?.label ?? null,
      status: timeline[0]?.status ?? null,
    },
    edgarSearchUrl: `https://www.sec.gov/edgar/search/#/category=custom&entityName=${encodeURIComponent(sym)}`,
  };
}

/** Lightweight public dilution chip (read-only; no TrustTicker entitlement gate). */
export async function hasRecentDilutionSignal(symbol: string): Promise<boolean> {
  const sym = symbol.toUpperCase();
  const n = await prisma.dilutionInstrument.count({
    where: {
      symbol: sym,
      OR: [
        { status: { in: ["active", "pending"] } },
        { filingDate: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
      ],
    },
  });
  return n > 0;
}
