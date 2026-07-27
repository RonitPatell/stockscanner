import { prisma } from "../prisma.ts";
import { buildEventOutcome, buildFeatureVector } from "./features.ts";
import { buildAnalogueReport } from "./report.ts";
import { detectAnalogueBias, type BiasCorpusRow } from "./bias.ts";
import type {
  AnalogueEventOutcome,
  AnalogueFeatureVector,
  AnalogueMatchCriteria,
  AnalogueReport,
} from "./types.ts";
import type { HorizonMetrics, PriceSnapshot } from "../calibration/types.ts";
import type { CorporateActionFactor } from "./corporate-actions.ts";

function parseJudgment(raw: unknown): {
  directionalImplication?: string | null;
  version?: string | null;
  flags?: string[] | null;
} | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    directionalImplication:
      typeof o.directionalImplication === "string"
        ? o.directionalImplication
        : null,
    version: typeof o.version === "string" ? o.version : null,
    flags: Array.isArray(o.flags) ? o.flags.map(String) : null,
  };
}

async function loadCorporateActions(): Promise<CorporateActionFactor[]> {
  // Optional JSON env or empty — factors can be injected in tests/service opts
  const raw = process.env.CORPORATE_ACTION_FACTORS_JSON;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as CorporateActionFactor[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

type CorpusEntry = {
  features: AnalogueFeatureVector;
  outcome: AnalogueEventOutcome;
};

async function loadCorpus(opts?: {
  lookbackDays?: number;
  corporateActions?: CorporateActionFactor[];
}): Promise<{ corpus: CorpusEntry[]; biasRows: BiasCorpusRow[] }> {
  const lookbackDays = opts?.lookbackDays ?? 180;
  const since = new Date(Date.now() - lookbackDays * 86400_000);
  const factors = opts?.corporateActions ?? (await loadCorporateActions());

  const outcomes = await prisma.catalystOutcome.findMany({
    where: { createdAt: { gte: since } },
    take: 2000,
    orderBy: { createdAt: "desc" },
  });

  const catalystIds = outcomes.map((o) => o.catalystId);
  const catalysts = await prisma.catalyst.findMany({
    where: { id: { in: catalystIds } },
    select: {
      id: true,
      symbol: true,
      headline: true,
      publishedAt: true,
      createdAt: true,
      catalystType: true,
      sourceTier: true,
      price: true,
      floatShares: true,
      volume: true,
      avgVolume: true,
      changePercent: true,
      sentimentLabel: true,
      sentimentScore: true,
      setupTags: true,
      judgmentJson: true,
      judgmentVersion: true,
    },
  });
  const byId = new Map(catalysts.map((c) => [c.id, c]));

  // First reaction stage snapshot if available
  let stages = new Map<string, string>();
  try {
    const snaps = await prisma.reactionStageSnapshot.findMany({
      where: { catalystId: { in: catalystIds } },
      orderBy: { createdAt: "asc" },
      select: { catalystId: true, stage: true },
      take: 5000,
    });
    for (const s of snaps) {
      if (!stages.has(s.catalystId)) stages.set(s.catalystId, s.stage);
    }
  } catch {
    /* model may lag generate */
  }

  const corpus: CorpusEntry[] = [];
  const biasRows: BiasCorpusRow[] = [];

  for (const o of outcomes) {
    const c = byId.get(o.catalystId);
    if (!c) continue;

    const judgment = parseJudgment(c.judgmentJson);
    if (judgment && c.judgmentVersion) {
      judgment.version = c.judgmentVersion;
    }

    const features = buildFeatureVector({
      catalystId: c.id,
      symbol: c.symbol,
      headline: c.headline,
      publishedAt: c.publishedAt,
      ingestedAt: c.createdAt,
      catalystType: o.catalystType ?? c.catalystType,
      sourceTier: o.sourceTier ?? c.sourceTier,
      price: c.price,
      floatShares: c.floatShares,
      volume: c.volume,
      avgVolume: c.avgVolume,
      changePercent: c.changePercent,
      sentimentLabel: c.sentimentLabel,
      sentimentScore: c.sentimentScore,
      setupTags: c.setupTags,
      judgment,
      reactionStage: stages.get(c.id) ?? null,
      corporateActions: factors,
    });

    // Prefer denormalized buckets from outcome when present (event-time freeze)
    if (o.floatBucket) features.floatBucket = o.floatBucket;
    if (o.liquidityBucket) features.liquidityBucket = o.liquidityBucket;
    if (o.marketSession) features.marketSession = o.marketSession;

    const snapshots =
      o.snapshots && typeof o.snapshots === "object"
        ? (o.snapshots as unknown as Partial<Record<string, PriceSnapshot>>)
        : null;
    const metrics =
      o.metrics && typeof o.metrics === "object"
        ? (o.metrics as unknown as
            | HorizonMetrics[]
            | Record<string, HorizonMetrics>)
        : null;

    const outcome = buildEventOutcome({
      catalystId: c.id,
      symbol: c.symbol,
      metrics,
      snapshots,
      mfePct: o.mfePct,
      maePct: o.maePct,
      spreadPct: o.spreadPct,
      dataComplete: o.dataComplete,
      excludeReason: o.excludeReason ?? features.excludeReason,
      halted: Boolean(
        o.excludeReason === "halt_language" ||
          (typeof o.snapshots === "object" &&
            JSON.stringify(o.snapshots).includes("HALTED"))
      ),
    });

    // If primary return exists but metrics JSON empty, seed m15
    if (outcome.returns.m15 == null && o.rawReturnPct != null) {
      outcome.returns.m15 = o.rawReturnPct;
      outcome.valid = true;
      outcome.invalidReason = null;
    }

    corpus.push({ features, outcome });

    biasRows.push({
      catalystId: c.id,
      symbol: c.symbol,
      ingestedAt: c.createdAt.toISOString(),
      category: c.catalystType,
      delistedOrChanged: features.delistedOrChanged,
      eligibleUrgent: o.eligibleUrgent,
      excludeReason: o.excludeReason,
      dataComplete: o.dataComplete,
      hasOutcome: o.dataComplete || o.rawReturnPct != null,
      classificationVersion: c.judgmentVersion,
      marketSession: o.marketSession,
      sourceTier: o.sourceTier ?? c.sourceTier,
    });
  }

  return { corpus, biasRows };
}

export async function getAnalogueReportForCatalyst(opts: {
  catalystId: string;
  criteria?: AnalogueMatchCriteria;
  lookbackDays?: number;
  limit?: number;
  corporateActions?: CorporateActionFactor[];
}): Promise<AnalogueReport | { error: string }> {
  const catalyst = await prisma.catalyst.findUnique({
    where: { id: opts.catalystId },
  });
  if (!catalyst) return { error: "Catalyst not found" };

  let reactionStage: string | null = null;
  try {
    const snap = await prisma.reactionStageSnapshot.findFirst({
      where: { catalystId: catalyst.id },
      orderBy: { createdAt: "asc" },
      select: { stage: true },
    });
    reactionStage = snap?.stage ?? null;
  } catch {
    /* ignore */
  }

  const factors = opts.corporateActions ?? (await loadCorporateActions());
  const judgment = parseJudgment(catalyst.judgmentJson);
  if (judgment && catalyst.judgmentVersion) {
    judgment.version = catalyst.judgmentVersion;
  }

  const query = buildFeatureVector({
    catalystId: catalyst.id,
    symbol: catalyst.symbol,
    headline: catalyst.headline,
    publishedAt: catalyst.publishedAt,
    ingestedAt: catalyst.createdAt,
    catalystType: catalyst.catalystType,
    sourceTier: catalyst.sourceTier,
    price: catalyst.price,
    floatShares: catalyst.floatShares,
    volume: catalyst.volume,
    avgVolume: catalyst.avgVolume,
    changePercent: catalyst.changePercent,
    sentimentLabel: catalyst.sentimentLabel,
    sentimentScore: catalyst.sentimentScore,
    setupTags: catalyst.setupTags,
    judgment,
    reactionStage,
    corporateActions: factors,
  });

  const { corpus } = await loadCorpus({
    lookbackDays: opts.lookbackDays,
    corporateActions: factors,
  });

  return buildAnalogueReport({
    query,
    corpus,
    criteria: opts.criteria,
    limit: opts.limit ?? 50,
  });
}

export async function getAnalogueBiasReport(opts?: {
  lookbackDays?: number;
}): Promise<ReturnType<typeof detectAnalogueBias>> {
  const { biasRows } = await loadCorpus({ lookbackDays: opts?.lookbackDays });
  return detectAnalogueBias(biasRows);
}
