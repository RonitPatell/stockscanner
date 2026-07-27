import { prisma } from "../prisma.ts";
import {
  assessMatchConfidence,
  extractDuplicateCashtags,
  type MatchAssessment,
  type MatchDisposition,
} from "./match-assess.ts";

export {
  assessMatchConfidence,
  extractDuplicateCashtags,
  type MatchAssessment,
  type MatchDisposition,
};

export async function quarantineMatch(input: {
  rawNewsId: string;
  symbol?: string | null;
  headline: string;
  source: string;
  confidence: number;
  matchMethod?: string | null;
  reason: string;
  publishedAt?: Date | null;
}): Promise<void> {
  await prisma.matchQuarantine.upsert({
    where: { rawNewsId: input.rawNewsId },
    create: {
      rawNewsId: input.rawNewsId,
      symbol: input.symbol?.toUpperCase() ?? null,
      headline: input.headline.slice(0, 500),
      source: input.source.slice(0, 80),
      confidence: input.confidence,
      matchMethod: input.matchMethod ?? null,
      reason: input.reason.slice(0, 80),
      publishedAt: input.publishedAt ?? null,
    },
    update: {
      symbol: input.symbol?.toUpperCase() ?? null,
      confidence: input.confidence,
      matchMethod: input.matchMethod ?? null,
      reason: input.reason.slice(0, 80),
    },
  });
}
