import { getCachedQuotes } from "../quote-cache-service.ts";
import { isDilutionCatalyst } from "../action-playbook.ts";
import { prisma } from "../prisma.ts";
import { INSTRUMENT_LABELS, type DilutionInstrumentType } from "./types.ts";
import { getDilutionTimeline } from "./timeline.ts";

export interface DilutionAlertV2 {
  id: string;
  symbol: string;
  headline: string;
  source: string;
  publishedAt: string;
  ingestedAt: string;
  changePercent: number | null;
  floatShares: number | null;
  price: number | null;
  why: string;
  version: "dilution-radar-v2";
  instrumentType?: string;
  instrumentLabel?: string;
  status?: string;
  capacityKind?: string;
  estimateLabel?: string;
  potentialDilutionPct?: number | null;
  confidence?: number;
  sourceUrl?: string | null;
  accessionNumber?: string | null;
  evidenceSnippets?: string[];
  missingFields?: string[];
  needsManualReview?: boolean;
  capacityNote?: string;
}

function capacityNoteFor(kind: string): string | undefined {
  switch (kind) {
    case "registration_capacity":
      return "Registration capacity — not a confirmed sale.";
    case "atm_availability":
      return "ATM availability — not confirmed issuance.";
    case "announced_sale":
      return "Announced sale — verify settlement.";
    case "confirmed_issuance":
      return "Filing language suggests confirmed issuance.";
    default:
      return undefined;
  }
}

/**
 * Dilution Radar V2 feed — prefers SEC-instrument rows; falls back to legacy catalyst heuristics.
 */
export async function getDilutionRadar(limit = 12, hours = 48): Promise<DilutionAlertV2[]> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const instruments = await prisma.dilutionInstrument.findMany({
    where: {
      OR: [
        { filingDate: { gte: since } },
        { filingDate: null, createdAt: { gte: since } },
      ],
    },
    orderBy: [{ filingDate: "desc" }, { createdAt: "desc" }],
    take: 80,
  });

  const symbols = [...new Set(instruments.map((i) => i.symbol))];
  const quotes = symbols.length ? await getCachedQuotes(symbols) : {};

  const fromInstruments: DilutionAlertV2[] = instruments.map((r) => {
    const q = quotes[r.symbol];
    const label =
      INSTRUMENT_LABELS[r.instrumentType as DilutionInstrumentType] || r.instrumentType;
    const pct =
      r.potentialDilutionPct != null
        ? ` · ~${r.potentialDilutionPct}% potential (${r.estimateLabel})`
        : ` · dilution % ${r.estimateLabel}`;
    const why = [
      label,
      r.capacityKind.replace(/_/g, " "),
      pct,
      r.needsManualReview ? "· needs review" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return {
      id: r.id,
      symbol: r.symbol,
      headline: `${label}${r.formType ? ` (${r.formType})` : ""}`,
      source: "SEC EDGAR",
      publishedAt: (r.filingDate ?? r.createdAt).toISOString(),
      ingestedAt: r.createdAt.toISOString(),
      changePercent: q?.changePercent ?? null,
      floatShares: r.sharesOutstandingDenom,
      price: q?.price ?? null,
      why,
      version: "dilution-radar-v2" as const,
      instrumentType: r.instrumentType,
      instrumentLabel: label,
      status: r.status,
      capacityKind: r.capacityKind,
      estimateLabel: r.estimateLabel,
      potentialDilutionPct: r.potentialDilutionPct,
      confidence: r.confidence,
      sourceUrl: r.sourceUrl,
      accessionNumber: r.accessionNumber,
      evidenceSnippets: r.evidenceSnippets,
      missingFields: r.missingFields,
      needsManualReview: r.needsManualReview,
      capacityNote: capacityNoteFor(r.capacityKind),
    };
  });

  const legacy = await prisma.catalyst.findMany({
    where: {
      publishedAt: { gte: since },
      OR: [
        { catalystType: { in: ["offering", "dilution"] } },
        { headline: { contains: "offering", mode: "insensitive" } },
        { headline: { contains: "dilut", mode: "insensitive" } },
        { headline: { contains: "424B5", mode: "insensitive" } },
        { headline: { contains: "prospectus", mode: "insensitive" } },
        { headline: { contains: "registered direct", mode: "insensitive" } },
        { headline: { contains: "ATM", mode: "insensitive" } },
        { rawNewsId: { startsWith: "sec-424b5-" } },
        { rawNewsId: { startsWith: "sec-s-3" } },
        { rawNewsId: { startsWith: "sec-s-1" } },
      ],
    },
    orderBy: { publishedAt: "desc" },
    take: 40,
    select: {
      id: true,
      symbol: true,
      headline: true,
      source: true,
      sourceUrl: true,
      publishedAt: true,
      createdAt: true,
      changePercent: true,
      floatShares: true,
      price: true,
      catalystType: true,
      rawNewsId: true,
    },
  });

  const instrumentIds = new Set(fromInstruments.map((i) => i.id));
  const fromLegacy: DilutionAlertV2[] = legacy
    .filter(
      (r) =>
        isDilutionCatalyst({ catalystType: r.catalystType, headline: r.headline }) ||
        /^sec-(424b5|s-1|s-3)/i.test(r.rawNewsId || "")
    )
    .filter((r) => !instrumentIds.has(r.id))
    .map((r) => {
      const q = quotes[r.symbol];
      const lowFloat = r.floatShares != null && r.floatShares < 20_000_000;
      return {
        id: r.id,
        symbol: r.symbol,
        headline: r.headline,
        source: r.source,
        publishedAt: r.publishedAt.toISOString(),
        ingestedAt: r.createdAt.toISOString(),
        changePercent: q?.changePercent ?? r.changePercent,
        floatShares: r.floatShares,
        price: q?.price ?? r.price,
        why: lowFloat
          ? "Low float + dilution language — wait for price discovery"
          : "Dilutive event language — confirm with filing evidence when available",
        version: "dilution-radar-v2" as const,
        sourceUrl: r.sourceUrl,
        capacityNote: "Legacy headline match — open filing for structured terms.",
      };
    });

  const merged = [...fromInstruments, ...fromLegacy];
  const seen = new Set<string>();
  const out: DilutionAlertV2[] = [];
  for (const item of merged) {
    const key = `${item.symbol}:${item.instrumentType || item.headline.slice(0, 24)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

export { getDilutionTimeline };
