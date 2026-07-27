import { notFound } from "next/navigation";
import Link from "next/link";
import { TradingDashboard } from "@/components/TradingDashboard";
import { LogoMark } from "@/components/Logo";
import { verifyPromoCaptureToken } from "@/lib/promo-capture-token";
import type {
  CatalystItem,
  MarketScannerSnapshot,
  ScannerFilters,
} from "@/types";

export const dynamic = "force-dynamic";

/**
 * Internal promo capture page — renders the REAL TradingDashboard with rich
 * seeded data so Playwright can screenshot the actual Pro desk for marketing
 * video assets. Gated by a short-lived HMAC token (not the raw cron secret).
 */

function buildCatalysts(): CatalystItem[] {
  const now = Date.now();
  const min = (m: number) => new Date(now - m * 60_000).toISOString();
  return [
    {
      id: "cap-mrna",
      symbol: "MRNA",
      headline:
        "Phase 3 trial shows 94% efficacy; FDA fast track granted for lead candidate",
      source: "GlobeNewswire",
      publishedAt: min(3),
      ingestedAt: min(3),
      ingestDelaySec: 2,
      aiSummary:
        "Biotech catalyst with strong trial readout and regulatory acceleration. Similar fast-track announcements have historically produced sharp gap-and-go moves.",
      sentimentScore: 82,
      sentimentLabel: "Very Bullish",
      floatShares: 380_000_000,
      marketCap: 42_000_000_000,
      price: 118.4,
      changePercent: 16.94,
      volume: 18_200_000,
      avgVolume: 6_100_000,
      rVol: 4.2,
      historicalAvgMove: 18.5,
      historicalSampleSize: 12,
      catalystType: "fda",
      urgencyScore: 88,
      setupTags: ["gapper", "heavy_volume"],
      verifiedConfidence: 0.94,
      sourceTier: "wire",
      keyPoints: [
        "Primary endpoint met with 94% efficacy",
        "FDA fast track designation confirmed",
        "Three wire sources reporting same story",
      ],
      newsCount: 3,
    },
    {
      id: "cap-smci",
      symbol: "SMCI",
      headline:
        "Raises full-year revenue guidance on record AI server backlog; shares gap up",
      source: "Business Wire",
      publishedAt: min(7),
      ingestedAt: min(7),
      ingestDelaySec: 3,
      aiSummary:
        "Guidance raise on AI infrastructure demand. Watch for continuation over premarket high with sector sympathy in server / semis names.",
      sentimentScore: 76,
      sentimentLabel: "Very Bullish",
      floatShares: 52_000_000,
      marketCap: 48_000_000_000,
      price: 842.1,
      changePercent: 11.28,
      volume: 9_400_000,
      avgVolume: 4_100_000,
      rVol: 3.1,
      historicalAvgMove: 14.2,
      historicalSampleSize: 9,
      catalystType: "earnings",
      urgencyScore: 81,
      setupTags: ["gapper", "sector_momentum"],
      verifiedConfidence: 0.92,
      sourceTier: "wire",
      keyPoints: [
        "FY revenue guide raised ~12%",
        "Record AI server backlog cited",
      ],
      newsCount: 2,
    },
    {
      id: "cap-amd",
      symbol: "AMD",
      headline:
        "Wins $2.1B multi-year data center AI accelerator contract with major hyperscaler",
      source: "Business Wire",
      publishedAt: min(11),
      ingestedAt: min(11),
      ingestDelaySec: 2,
      aiSummary:
        "Large contract win validates AI GPU roadmap. Move is sympathy-linked to sector momentum in semis and data center names.",
      sentimentScore: 71,
      sentimentLabel: "Bullish",
      floatShares: 1_620_000_000,
      marketCap: 285_000_000_000,
      price: 176.2,
      changePercent: 5.82,
      volume: 42_000_000,
      avgVolume: 28_000_000,
      rVol: 2.1,
      historicalAvgMove: 12.3,
      historicalSampleSize: 18,
      catalystType: "contract",
      urgencyScore: 72,
      setupTags: ["sector_momentum", "heavy_volume"],
      verifiedConfidence: 0.91,
      sourceTier: "wire",
      keyPoints: [
        "$2.1B contract over 4 years",
        "Delivery begins next quarter",
      ],
      relatedSymbols: ["NVDA", "SMCI"],
      newsCount: 2,
    },
    {
      id: "cap-bjdx",
      symbol: "BJDX",
      headline:
        "Receives FDA 510(k) clearance for point-of-care molecular diagnostics platform",
      source: "PR Newswire",
      publishedAt: min(16),
      ingestedAt: min(16),
      ingestDelaySec: 4,
      aiSummary:
        "Low-float biotech clearance catalyst. Extremely high rVol — classic momentum profile, but spread risk elevated on sub-$2 names.",
      sentimentScore: 68,
      sentimentLabel: "Bullish",
      floatShares: 18_000_000,
      marketCap: 42_000_000,
      price: 1.54,
      changePercent: 33.45,
      volume: 48_000_000,
      avgVolume: 4_500_000,
      rVol: 10.6,
      historicalAvgMove: 27.4,
      historicalSampleSize: 6,
      catalystType: "fda",
      urgencyScore: 84,
      setupTags: ["low_float", "gapper", "heavy_volume"],
      verifiedConfidence: 0.88,
      sourceTier: "wire",
      keyPoints: ["510(k) clearance granted", "Commercial launch this quarter"],
      newsCount: 1,
    },
    {
      id: "cap-nvda",
      symbol: "NVDA",
      headline:
        "Hyperscaler capex commentary lifts AI complex; analysts see sustained GPU demand",
      source: "Reuters",
      publishedAt: min(24),
      ingestedAt: min(24),
      ingestDelaySec: 5,
      aiSummary:
        "Macro/sector catalyst driving broad AI-complex strength. Better traded through sector leaders and sympathy names than the index itself.",
      sentimentScore: 62,
      sentimentLabel: "Bullish",
      floatShares: 2_300_000_000,
      marketCap: 3_400_000_000_000,
      price: 142.5,
      changePercent: 4.8,
      volume: 85_000_000,
      avgVolume: 52_000_000,
      rVol: 1.6,
      historicalAvgMove: 7.8,
      historicalSampleSize: 22,
      catalystType: "macro",
      urgencyScore: 61,
      setupTags: ["sector_momentum"],
      verifiedConfidence: 0.9,
      sourceTier: "wire",
      relatedSymbols: ["AMD", "SMCI", "AVGO"],
      newsCount: 4,
    },
    {
      id: "cap-pltr",
      symbol: "PLTR",
      headline:
        "Department of Defense extends enterprise AI analytics platform contract through 2028",
      source: "PR Newswire",
      publishedAt: min(31),
      ingestedAt: min(31),
      ingestDelaySec: 3,
      aiSummary:
        "Recurring government revenue catalyst. Typically slower drift higher rather than immediate gap — better for swing holds than scalps.",
      sentimentScore: 64,
      sentimentLabel: "Bullish",
      floatShares: 2_180_000_000,
      marketCap: 98_000_000_000,
      price: 44.8,
      changePercent: 3.41,
      volume: 28_500_000,
      avgVolume: 22_000_000,
      rVol: 1.4,
      historicalAvgMove: 9.1,
      historicalSampleSize: 9,
      catalystType: "gov_contract",
      urgencyScore: 58,
      setupTags: ["sector_momentum"],
      verifiedConfidence: 0.87,
      sourceTier: "wire",
      keyPoints: ["Contract extension through 2028"],
      newsCount: 1,
    },
    {
      id: "cap-sofi",
      symbol: "SOFI",
      headline:
        "Analyst upgrade: price target raised to $18 on improving net interest margin",
      source: "MarketWatch",
      publishedAt: min(38),
      ingestedAt: min(38),
      ingestDelaySec: 11,
      aiSummary:
        "Analyst-driven move — moderate urgency. Works best when paired with volume confirmation and fintech sector tailwind.",
      sentimentScore: 55,
      sentimentLabel: "Moderately Bullish",
      floatShares: 1_050_000_000,
      marketCap: 16_500_000_000,
      price: 15.72,
      changePercent: 4.12,
      volume: 19_800_000,
      avgVolume: 14_200_000,
      rVol: 1.8,
      historicalAvgMove: 6.4,
      historicalSampleSize: 24,
      catalystType: "analyst",
      urgencyScore: 45,
      setupTags: [],
      verifiedConfidence: 0.72,
      sourceTier: "aggregator",
      keyPoints: ["PT raised from $14 to $18"],
      newsCount: 1,
    },
    {
      id: "cap-rivn",
      symbol: "RIVN",
      headline: "Announces $1.5B secondary offering at discount to last close",
      source: "Reuters",
      publishedAt: min(47),
      ingestedAt: min(47),
      ingestDelaySec: 4,
      aiSummary:
        "Dilutive offering — bearish near-term pressure typical. Watch for bounce only after offering prices and volume exhausts.",
      sentimentScore: -68,
      sentimentLabel: "Bearish",
      floatShares: 980_000_000,
      marketCap: 12_800_000_000,
      price: 13.1,
      changePercent: -8.44,
      volume: 31_200_000,
      avgVolume: 12_500_000,
      rVol: 3.6,
      historicalAvgMove: -11.2,
      historicalSampleSize: 15,
      catalystType: "offering",
      urgencyScore: 76,
      setupTags: ["heavy_volume"],
      verifiedConfidence: 0.89,
      sourceTier: "wire",
      keyPoints: ["$1.5B secondary at 8% discount"],
      newsCount: 2,
    },
    {
      id: "cap-gctk",
      symbol: "GCTK",
      headline:
        "Announces strategic distribution partnership for glucose monitoring device in EU",
      source: "GlobeNewswire",
      publishedAt: min(55),
      ingestedAt: min(55),
      ingestDelaySec: 6,
      aiSummary:
        "Small-cap partnership catalyst with heavy relative volume. Momentum profile, elevated risk on thin float.",
      sentimentScore: 58,
      sentimentLabel: "Bullish",
      floatShares: 22_000_000,
      marketCap: 15_000_000,
      price: 0.42,
      changePercent: 18.2,
      volume: 22_000_000,
      avgVolume: 3_100_000,
      rVol: 7.1,
      catalystType: "contract",
      urgencyScore: 66,
      setupTags: ["low_float", "heavy_volume"],
      verifiedConfidence: 0.8,
      sourceTier: "wire",
      newsCount: 1,
    },
    {
      id: "cap-tsla",
      symbol: "TSLA",
      headline:
        "Reports record quarterly deliveries, beating consensus by 6% on energy storage strength",
      source: "Business Wire",
      publishedAt: min(63),
      ingestedAt: min(63),
      ingestDelaySec: 2,
      aiSummary:
        "Delivery beat with energy segment upside. Historically produces multi-day drift when paired with margin commentary.",
      sentimentScore: 60,
      sentimentLabel: "Bullish",
      floatShares: 2_700_000_000,
      marketCap: 780_000_000_000,
      price: 246.3,
      changePercent: 6.12,
      volume: 96_000_000,
      avgVolume: 71_000_000,
      rVol: 1.4,
      historicalAvgMove: 8.9,
      historicalSampleSize: 16,
      catalystType: "earnings",
      urgencyScore: 63,
      setupTags: ["sector_momentum"],
      verifiedConfidence: 0.93,
      sourceTier: "wire",
      newsCount: 3,
    },
  ];
}

function buildScanner(): MarketScannerSnapshot {
  const now = Date.now();
  const sec = (s: number) => new Date(now - s * 1000).toISOString();
  return {
    scannedAt: sec(12),
    marketSession: "regular",
    volumeLeaders: [
      {
        symbol: "BJDX",
        price: 1.54,
        changePercent: 33.45,
        volume: 48_000_000,
        avgVolume: 4_500_000,
        rVol: 10.6,
        dayHigh: 1.58,
        nearHod: true,
        marketCap: 42_000_000,
      },
      {
        symbol: "GCTK",
        price: 0.42,
        changePercent: 18.2,
        volume: 22_000_000,
        avgVolume: 3_100_000,
        rVol: 7.1,
        dayHigh: 0.44,
        nearHod: false,
        marketCap: 15_000_000,
      },
      {
        symbol: "MRNA",
        price: 118.4,
        changePercent: 16.94,
        volume: 18_200_000,
        avgVolume: 6_100_000,
        rVol: 4.2,
        dayHigh: 119.9,
        nearHod: true,
        marketCap: 42_000_000_000,
      },
      {
        symbol: "SMCI",
        price: 842.1,
        changePercent: 11.28,
        volume: 9_400_000,
        avgVolume: 4_100_000,
        rVol: 3.1,
        dayHigh: 851.0,
        nearHod: true,
        marketCap: 48_000_000_000,
      },
      {
        symbol: "RIVN",
        price: 13.1,
        changePercent: -8.44,
        volume: 31_200_000,
        avgVolume: 12_500_000,
        rVol: 3.6,
        dayHigh: 14.4,
        nearHod: false,
        marketCap: 12_800_000_000,
      },
      {
        symbol: "AMD",
        price: 176.2,
        changePercent: 5.82,
        volume: 42_000_000,
        avgVolume: 28_000_000,
        rVol: 2.1,
        dayHigh: 177.8,
        nearHod: true,
        marketCap: 285_000_000_000,
      },
      {
        symbol: "NVDA",
        price: 142.5,
        changePercent: 4.8,
        volume: 85_000_000,
        avgVolume: 52_000_000,
        rVol: 1.6,
        dayHigh: 143.2,
        nearHod: true,
        marketCap: 3_400_000_000_000,
      },
      {
        symbol: "TSLA",
        price: 246.3,
        changePercent: 6.12,
        volume: 96_000_000,
        avgVolume: 71_000_000,
        rVol: 1.4,
        dayHigh: 248.9,
        nearHod: false,
        marketCap: 780_000_000_000,
      },
    ],
    alerts: [
      {
        id: "cap-alert-1",
        symbol: "BJDX",
        type: "hod",
        message: "High of day — +33.5%",
        changePercent: 33.45,
        price: 1.54,
        rVol: 10.6,
        timestamp: sec(25),
      },
      {
        id: "cap-alert-2",
        symbol: "MRNA",
        type: "volume_surge",
        message: "Heavy volume — 4.2× avg on FDA fast track",
        changePercent: 16.94,
        price: 118.4,
        rVol: 4.2,
        timestamp: sec(48),
      },
      {
        id: "cap-alert-3",
        symbol: "SMCI",
        type: "near_hod",
        message: "Near HOD — +11.3% on guidance raise",
        changePercent: 11.28,
        price: 842.1,
        rVol: 3.1,
        timestamp: sec(76),
      },
      {
        id: "cap-alert-4",
        symbol: "GCTK",
        type: "volume_surge",
        message: "Heavy volume — 7.1× avg",
        changePercent: 18.2,
        price: 0.42,
        rVol: 7.1,
        timestamp: sec(112),
      },
      {
        id: "cap-alert-5",
        symbol: "AMD",
        type: "momentum",
        message: "Momentum — +5.8% on $2.1B contract win",
        changePercent: 5.82,
        price: 176.2,
        rVol: 2.1,
        timestamp: sec(160),
      },
      {
        id: "cap-alert-6",
        symbol: "NVDA",
        type: "near_hod",
        message: "Near HOD — +4.8% today",
        changePercent: 4.8,
        price: 142.5,
        rVol: 1.6,
        timestamp: sec(210),
      },
    ],
  };
}

export default async function DeskCapturePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const expected = process.env.CRON_SECRET;
  const ok = verifyPromoCaptureToken(expected, token);
  if (!ok) {
    notFound();
  }

  const initialFilters: ScannerFilters = {};
  const initialWatchlist = ["NVDA", "AMD", "MRNA", "SMCI", "PLTR"];

  return (
    <div className="dashboard-page min-h-screen xl:h-screen flex flex-col overflow-y-auto xl:overflow-hidden bg-zinc-950 text-zinc-100">
      <header className="shrink-0 z-40 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-xl">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-4 h-12 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 hover:opacity-90 transition-opacity"
          >
            <LogoMark className="w-7 h-7" />
            <span className="font-bold">
              Trust<span className="text-emerald-400">Ticker</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-orange-300/90 hidden sm:inline">
              Prop Desk
            </span>
            <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-300">
              PRO
            </span>
          </div>
        </div>
      </header>

      <main className="dashboard-main flex-1 min-h-0 max-w-[1600px] w-full mx-auto px-3 sm:px-4 py-2 overflow-visible xl:overflow-hidden">
        <TradingDashboard
          initialCatalysts={buildCatalysts()}
          initialWatchlist={initialWatchlist}
          initialFilters={initialFilters}
          initialScanner={buildScanner()}
        />
      </main>
    </div>
  );
}
