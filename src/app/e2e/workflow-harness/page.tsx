import { notFound } from "next/navigation";
import { DashboardShellV3 } from "@/components/dashboard-shell/DashboardShellV3";
import { isE2eWorkflowHarnessAllowed } from "@/lib/e2e-harness";
import type { CatalystItem } from "@/types";
import type { JudgmentV2 } from "@/lib/judgment/types";

export const dynamic = "force-dynamic";

/**
 * Seeded Shell V3 harness for Playwright workflow audit.
 * Gated by ALLOW_E2E_HARNESS=1 — not available in production.
 *
 * Usability questions this surface must answer:
 * 1. What should the user look at first?
 * 2. What changed recently?
 * 3. Why does this event matter?
 * 4. What is the primary risk?
 * 5. What action inside the application is available next?
 */

function minsAgo(m: number) {
  return new Date(Date.now() - m * 60_000).toISOString();
}

function buildSeeds(): CatalystItem[] {
  const fda: JudgmentV2 = {
    version: "judgment-v2.0",
    classifiedAt: minsAgo(3),
    verifiedFacts: ["Phase 3 primary endpoint met; FDA fast track confirmed."],
    automatedInterpretation: ["Positive regulatory acceleration"],
    missingOrUncertain: [],
    catalystStrength: "STRONG",
    directionalImplication: "POSITIVE",
    timing: "IMMEDIATE",
    tradeability: "LIQUID",
    confidence: "HIGH",
    riskFlags: [],
    scoreContributions: [],
    grade: "go",
    gradeLabel: "GO",
    gradeRationale: "Strong material catalyst",
    disclaimer: "Not financial advice",
    changeLog: [],
  };

  const offering: JudgmentV2 = {
    version: "judgment-v2.0",
    classifiedAt: minsAgo(8),
    verifiedFacts: ["ABCD prices $40M registered direct offering at $2.50."],
    automatedInterpretation: ["Dilutive capital raise"],
    missingOrUncertain: ["Warrant coverage not confirmed in headline"],
    catalystStrength: "STRONG",
    directionalImplication: "NEGATIVE",
    timing: "IMMEDIATE",
    tradeability: "THIN",
    confidence: "HIGH",
    riskFlags: [
      {
        id: "registered_offering",
        label: "Registered offering",
        severity: "high",
        detail: "Registered direct language in primary source",
      },
    ],
    scoreContributions: [],
    grade: "skip",
    gradeLabel: "SKIP",
    gradeRationale: "Offering risk",
    disclaimer: "Not financial advice",
    changeLog: [],
  };

  return [
    {
      id: "seed-mrna-fda",
      symbol: "MRNA",
      headline:
        "Phase 3 trial shows 94% efficacy; FDA fast track granted for lead candidate",
      source: "GlobeNewswire",
      sourceUrl: "https://example.com/seed/mrna-fda",
      publishedAt: minsAgo(3),
      ingestedAt: minsAgo(2),
      changePercent: 16.94,
      price: 118.4,
      volume: 18_200_000,
      avgVolume: 6_100_000,
      rVol: 4.2,
      floatShares: 380_000_000,
      catalystType: "fda",
      urgencyScore: 92,
      verifiedConfidence: 94,
      sourceTier: "wire",
      judgmentV2: fda,
    },
    {
      id: "seed-abcd-offering",
      symbol: "ABCD",
      headline: "ABCD announces $40M registered direct offering",
      source: "SEC EDGAR",
      sourceUrl:
        "https://www.sec.gov/Archives/edgar/data/1234567/000123456724000202/424b5.htm",
      publishedAt: minsAgo(8),
      ingestedAt: minsAgo(7),
      changePercent: -18.4,
      price: 1.12,
      volume: 5_000_000,
      avgVolume: 600_000,
      rVol: 8.1,
      floatShares: 12_000_000,
      catalystType: "offering",
      urgencyScore: 88,
      verifiedConfidence: 91,
      sourceTier: "sec",
      judgmentV2: offering,
    },
    {
      id: "seed-smci-earn",
      symbol: "SMCI",
      headline:
        "Raises full-year revenue guidance on record AI server backlog",
      source: "Business Wire",
      sourceUrl: "https://example.com/seed/smci",
      publishedAt: minsAgo(15),
      ingestedAt: minsAgo(14),
      changePercent: 11.28,
      price: 842.1,
      volume: 9_400_000,
      avgVolume: 4_100_000,
      rVol: 3.1,
      floatShares: 52_000_000,
      catalystType: "earnings",
      urgencyScore: 70,
      verifiedConfidence: 80,
      sourceTier: "wire",
      judgmentV2: {
        ...fda,
        verifiedFacts: ["Full-year revenue guidance raised on AI backlog."],
      },
    },
  ];
}

export default function E2eWorkflowHarnessPage() {
  if (!isE2eWorkflowHarnessAllowed()) {
    notFound();
  }

  const catalysts = buildSeeds();

  return (
    <div
      className="h-screen flex flex-col min-h-0 bg-[var(--bg)]"
      data-testid="e2e-workflow-harness"
      data-e2e-harness="workflow-v1"
    >
      <div className="sr-only">
        E2E workflow harness. Seeded catalysts for audit only.
      </div>
      <DashboardShellV3
        initialCatalysts={catalysts}
        initialWatchlist={[]}
        initialFilters={null}
        initialScanner={null}
      />
    </div>
  );
}
