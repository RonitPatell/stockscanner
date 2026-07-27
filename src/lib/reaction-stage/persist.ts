import { prisma } from "../prisma.ts";
import { Prisma } from "@prisma/client";
import type { ReactionStageResult } from "./types.ts";

export async function persistReactionStageResult(
  result: ReactionStageResult,
  opts: {
    catalystId: string;
    symbol: string;
    category?: string | null;
    floatBucket?: string | null;
    priceBucket?: string | null;
    liquidityClass?: string | null;
  }
): Promise<{ snapshotId: string; transitionId: string | null }> {
  const snapshot = await prisma.reactionStageSnapshot.create({
    data: {
      catalystId: opts.catalystId,
      symbol: opts.symbol,
      engineVersion: result.engineVersion,
      stage: result.stage,
      previousStage: result.previousStage,
      profileId: result.profileId,
      flappedSuppressed: result.flappedSuppressed,
      explanation: result.explanation.slice(0, 2000),
      metricsJson: result.metrics as unknown as Prisma.InputJsonValue,
      rulesJson: result.rules as unknown as Prisma.InputJsonValue,
      conflictingJson: result.conflictingEvidence as unknown as Prisma.InputJsonValue,
      timelineJson: result.timeline as unknown as Prisma.InputJsonValue,
      marketSession: result.metrics.marketSession,
      category: opts.category ?? null,
      floatBucket: opts.floatBucket ?? null,
      priceBucket: opts.priceBucket ?? null,
      liquidityClass: opts.liquidityClass ?? null,
    },
    select: { id: true },
  });

  let transitionId: string | null = null;
  if (
    result.previousStage &&
    result.previousStage !== result.stage &&
    !result.flappedSuppressed
  ) {
    const t = await prisma.reactionStageTransition.create({
      data: {
        catalystId: opts.catalystId,
        symbol: opts.symbol,
        fromStage: result.previousStage,
        toStage: result.stage,
        engineVersion: result.engineVersion,
        reason: result.explanation.slice(0, 500),
        ruleIds: result.rules.filter((r) => r.passed).map((r) => r.id),
        profileId: result.profileId,
      },
      select: { id: true },
    });
    transitionId = t.id;
  }

  return { snapshotId: snapshot.id, transitionId };
}

export async function getLatestReactionStage(
  catalystId: string
): Promise<{
  stage: string;
  engineVersion: string;
  computedAt: Date;
  explanation: string;
} | null> {
  const row = await prisma.reactionStageSnapshot.findFirst({
    where: { catalystId },
    orderBy: { createdAt: "desc" },
    select: {
      stage: true,
      engineVersion: true,
      createdAt: true,
      explanation: true,
    },
  });
  if (!row) return null;
  return {
    stage: row.stage,
    engineVersion: row.engineVersion,
    computedAt: row.createdAt,
    explanation: row.explanation,
  };
}
