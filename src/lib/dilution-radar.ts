import { prisma } from "./prisma";
import { isDilutionCatalyst } from "./action-playbook";
import { getCachedQuotes } from "./quote-cache-service";

export interface DilutionAlert {
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
}

export async function getDilutionRadar(limit = 12, hours = 48): Promise<DilutionAlert[]> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const rows = await prisma.catalyst.findMany({
    where: {
      OR: [
        { catalystType: { in: ["offering", "dilution"] } },
        {
          headline: {
            contains: "offering",
            mode: "insensitive",
          },
        },
        {
          headline: {
            contains: "dilut",
            mode: "insensitive",
          },
        },
        {
          headline: {
            contains: "registered direct",
            mode: "insensitive",
          },
        },
      ],
      publishedAt: { gte: since },
    },
    orderBy: { publishedAt: "desc" },
    take: 80,
    select: {
      id: true,
      symbol: true,
      headline: true,
      source: true,
      publishedAt: true,
      createdAt: true,
      changePercent: true,
      floatShares: true,
      price: true,
      catalystType: true,
    },
  });

  const filtered = rows.filter((r) =>
    isDilutionCatalyst({ catalystType: r.catalystType, headline: r.headline })
  );

  const symbols = [...new Set(filtered.map((r) => r.symbol))];
  const quotes = symbols.length ? await getCachedQuotes(symbols) : {};

  return filtered.slice(0, limit).map((r) => {
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
        ? "Low float + dilution — classic trap for chase longs"
        : "Dilutive event — wait for price discovery, don't FOMO the spike",
    };
  });
}
