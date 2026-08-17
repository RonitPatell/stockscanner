import { NextRequest, NextResponse } from "next/server";
import { authorizeCron, cronUnauthorized } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { runThesisHealthEvaluation } from "@/lib/thesis/health/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Catch-up Thesis Health for active theses that are stale or never evaluated.
 * Bounded batch — not a full-history sync in UI requests.
 */
async function handle(req: NextRequest) {
  if (!authorizeCron(req)) return cronUnauthorized();

  const staleBefore = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const theses = await prisma.investmentThesis.findMany({
    where: {
      status: "active",
      OR: [
        { lastEvaluatedAt: null },
        { lastEvaluatedAt: { lt: staleBefore } },
      ],
    },
    orderBy: [{ lastEvaluatedAt: "asc" }, { updatedAt: "asc" }],
    take: 40,
    select: { id: true, symbol: true },
  });

  let ok = 0;
  let failed = 0;
  for (const t of theses) {
    const result = await runThesisHealthEvaluation({
      thesisId: t.id,
      triggerReason: "cron_stale",
    });
    if (result.ok) ok += 1;
    else failed += 1;
  }

  return NextResponse.json({
    ok: true,
    scanned: theses.length,
    evaluated: ok,
    failed,
  });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
