import { NextRequest, NextResponse } from "next/server";
import { requireTrustTickerAccess } from "@/lib/api-guard";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { getLatestThesisEvaluation } from "@/lib/thesis/health/persist";
import { parseHealthResultsJson } from "@/lib/thesis/health/parse-results";
import { scheduleThesisHealthForThesis } from "@/lib/thesis/health/schedule";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/thesis/[id]/health
 * Returns latest persisted Thesis Health summary + condition results.
 * Does not run expensive evaluation synchronously.
 *
 * POST schedules an async re-evaluation (rate-limited).
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const gate = await requireTrustTickerAccess();
  if (gate.error) return gate.error;

  const { id } = await ctx.params;
  const thesis = await prisma.investmentThesis.findFirst({
    where: { id, userId: gate.user.id },
    select: {
      id: true,
      symbol: true,
      healthStatus: true,
      lastEvaluatedAt: true,
    },
  });
  if (!thesis) {
    return NextResponse.json(
      { error: "Thesis not found", code: "NOT_FOUND" },
      { status: 404 }
    );
  }

  const latest = await getLatestThesisEvaluation(thesis.id);
  if (!latest) {
    return NextResponse.json({
      thesisId: thesis.id,
      symbol: thesis.symbol,
      healthStatus: thesis.healthStatus,
      lastEvaluatedAt: thesis.lastEvaluatedAt?.toISOString() ?? null,
      summary: null,
      conditions: [],
      score: null,
      evaluationId: null,
      pending: true,
    });
  }

  const parsed = parseHealthResultsJson(latest.resultsJson);
  return NextResponse.json({
    thesisId: thesis.id,
    symbol: thesis.symbol,
    healthStatus: latest.healthStatus,
    lastEvaluatedAt: latest.evaluatedAt.toISOString(),
    summary: parsed.summary,
    conditions: Array.isArray(
      (latest.resultsJson as { conditions?: unknown })?.conditions
    )
      ? (latest.resultsJson as { conditions: unknown[] }).conditions
      : [],
    /** Always null — not a stock score. */
    score: null,
    evaluationId: latest.id,
    companyEventIds: latest.companyEventIds,
    pending: false,
  });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const gate = await requireTrustTickerAccess();
  if (gate.error) return gate.error;

  const ip = clientIp(req);
  const rl = await rateLimit(
    `thesis-health:${gate.user.id}:${ip}`,
    20,
    60_000
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many health refresh requests. Try again shortly." },
      { status: 429, headers: rateLimitHeaders(rl, 20) }
    );
  }

  const { id } = await ctx.params;
  const thesis = await prisma.investmentThesis.findFirst({
    where: { id, userId: gate.user.id },
    select: { id: true },
  });
  if (!thesis) {
    return NextResponse.json(
      { error: "Thesis not found", code: "NOT_FOUND" },
      { status: 404 }
    );
  }

  scheduleThesisHealthForThesis(thesis.id, "manual_refresh");
  return NextResponse.json({
    ok: true,
    scheduled: true,
    thesisId: thesis.id,
  });
}
