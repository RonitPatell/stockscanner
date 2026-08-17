/**
 * Persist Thesis Health evaluation snapshots.
 * score is always null — no deceptive composite stock score.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "../../prisma.ts";
import type { ThesisHealthEvaluationResult } from "./types.ts";

export async function persistThesisHealthEvaluation(opts: {
  thesisId: string;
  result: ThesisHealthEvaluationResult;
  triggerReason?: string;
}): Promise<{ evaluationId: string }> {
  const resultsJson = {
    version: opts.result.version,
    evaluatedAt: opts.result.evaluatedAt,
    healthStatus: opts.result.healthStatus,
    summary: opts.result.summary,
    conditions: opts.result.conditions,
    triggerReason: opts.triggerReason ?? null,
    score: null,
  };

  const [evaluation] = await prisma.$transaction([
    prisma.thesisEvaluation.create({
      data: {
        thesisId: opts.thesisId,
        evaluatedAt: new Date(opts.result.evaluatedAt),
        healthStatus: opts.result.healthStatus,
        score: null,
        summary: formatSummaryLine(opts.result),
        resultsJson: resultsJson as Prisma.InputJsonValue,
        companyEventIds: opts.result.companyEventIds,
      },
      select: { id: true },
    }),
    prisma.investmentThesis.update({
      where: { id: opts.thesisId },
      data: {
        healthStatus: opts.result.healthStatus,
        lastEvaluatedAt: new Date(opts.result.evaluatedAt),
      },
    }),
  ]);

  return { evaluationId: evaluation.id };
}

function formatSummaryLine(result: ThesisHealthEvaluationResult): string {
  const s = result.summary;
  return `${s.passing} passing · ${s.warning} warning · ${s.failed} failed · ${s.unknown} unknown`;
}

export async function getLatestThesisEvaluation(thesisId: string): Promise<{
  id: string;
  evaluatedAt: Date;
  healthStatus: string;
  summary: string | null;
  resultsJson: unknown;
  companyEventIds: string[];
  score: number | null;
} | null> {
  return prisma.thesisEvaluation.findFirst({
    where: { thesisId },
    orderBy: [{ evaluatedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      evaluatedAt: true,
      healthStatus: true,
      summary: true,
      resultsJson: true,
      companyEventIds: true,
      score: true,
    },
  });
}
