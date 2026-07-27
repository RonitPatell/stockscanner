import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.ts";
import { buildJudgmentV2 } from "./build-v2.ts";
import { isJudgmentV2Enabled, type JudgmentV2 } from "./types.ts";
import type { CatalystItem } from "../../types/index.ts";

/** Persist Judgment V2 on a catalyst row (ingest / refresh). */
export async function persistJudgmentV2(
  catalystId: string,
  input: Parameters<typeof buildJudgmentV2>[0],
  previousRaw?: unknown
): Promise<JudgmentV2 | null> {
  if (!isJudgmentV2Enabled()) return null;

  let previous: JudgmentV2 | null = null;
  if (previousRaw && typeof previousRaw === "object") {
    previous = previousRaw as JudgmentV2;
  }

  const judgment = buildJudgmentV2(input, {
    previous,
    changeReason: previous ? "Recomputed at ingest/refresh" : "Initial classification",
  });

  await prisma.catalyst.update({
    where: { id: catalystId },
    data: {
      judgmentJson: judgment as unknown as Prisma.InputJsonValue,
      judgmentVersion: judgment.version,
      judgmentClassifiedAt: new Date(judgment.classifiedAt),
    },
  });

  // High-impact low-confidence → seed review queue (no auto rule change)
  if (
    judgment.confidence === "LOW" &&
    (judgment.catalystStrength === "STRONG" ||
      judgment.riskFlags.some((r) => r.severity === "high"))
  ) {
    await upsertReviewItem({
      catalystId,
      symbol: input.symbol,
      headline: input.headline,
      judgment,
      reportBump: 0,
    }).catch(() => {});
  }

  return judgment;
}

export async function upsertReviewItem(opts: {
  catalystId: string;
  symbol: string;
  headline: string;
  judgment: JudgmentV2;
  reportBump: number;
}): Promise<void> {
  const impact =
    opts.judgment.catalystStrength === "STRONG"
      ? 40
      : opts.judgment.catalystStrength === "MODERATE"
        ? 20
        : 5;
  const confPenalty =
    opts.judgment.confidence === "LOW" ? 35 : opts.judgment.confidence === "MEDIUM" ? 15 : 0;
  const riskBoost = opts.judgment.riskFlags.filter((r) => r.severity === "high").length * 12;

  const existing = await prisma.judgmentReviewItem.findUnique({
    where: { catalystId: opts.catalystId },
    select: { reportCount: true, priorityScore: true },
  });
  const reportCount = (existing?.reportCount ?? 0) + opts.reportBump;
  const priorityScore = impact + confPenalty + riskBoost + reportCount * 25;

  await prisma.judgmentReviewItem.upsert({
    where: { catalystId: opts.catalystId },
    create: {
      catalystId: opts.catalystId,
      symbol: opts.symbol.toUpperCase(),
      headline: opts.headline.slice(0, 280),
      priorityScore,
      reportCount,
      confidence: opts.judgment.confidence,
      catalystStrength: opts.judgment.catalystStrength,
      grade: opts.judgment.grade,
      judgmentVersion: opts.judgment.version,
      status: "open",
    },
    update: {
      priorityScore,
      reportCount,
      confidence: opts.judgment.confidence,
      catalystStrength: opts.judgment.catalystStrength,
      grade: opts.judgment.grade,
      judgmentVersion: opts.judgment.version,
      headline: opts.headline.slice(0, 280),
      status: "open",
    },
  });
}

export function parseStoredJudgment(raw: unknown): JudgmentV2 | null {
  if (!raw || typeof raw !== "object") return null;
  const j = raw as JudgmentV2;
  if (!j.version || !j.grade) return null;
  return j;
}

export function attachJudgmentToCatalystItem(
  item: CatalystItem,
  judgmentJson: unknown
): CatalystItem & { judgmentV2?: JudgmentV2 } {
  const j = parseStoredJudgment(judgmentJson);
  if (!j) return item;
  return { ...item, judgmentV2: j };
}
