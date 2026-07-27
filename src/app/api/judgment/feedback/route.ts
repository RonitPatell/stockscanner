import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  isJudgmentFeedbackAction,
  type JudgmentV2,
} from "@/lib/judgment/types";
import { upsertReviewItem } from "@/lib/judgment/persist";
import { buildJudgmentV2 } from "@/lib/judgment/build-v2";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = clientIp(req);
  const rl = await rateLimit(`judgment-fb:${session.user.id}:${ip}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many feedback submissions" },
      { status: 429, headers: rateLimitHeaders(rl, 30) }
    );
  }

  const body = await req.json().catch(() => ({}));
  const catalystId = String(body.catalystId ?? "");
  const action = String(body.action ?? "");
  if (!catalystId || !isJudgmentFeedbackAction(action)) {
    return NextResponse.json({ error: "Invalid feedback" }, { status: 400 });
  }

  const detail =
    typeof body.detail === "string" ? body.detail.trim().slice(0, 300) : null;
  const proposedTicker =
    typeof body.proposedTicker === "string"
      ? body.proposedTicker.trim().toUpperCase().slice(0, 5)
      : null;

  const catalyst = await prisma.catalyst.findUnique({
    where: { id: catalystId },
    select: {
      id: true,
      symbol: true,
      headline: true,
      source: true,
      sourceUrl: true,
      sourceTier: true,
      catalystType: true,
      sentimentScore: true,
      changePercent: true,
      floatShares: true,
      urgencyScore: true,
      verifiedConfidence: true,
      matchMethod: true,
      publishedAt: true,
      aiSummary: true,
      keyPoints: true,
      setupTags: true,
      judgmentJson: true,
      judgmentVersion: true,
      price: true,
    },
  });
  if (!catalyst) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const judgment: JudgmentV2 =
    catalyst.judgmentJson && typeof catalyst.judgmentJson === "object"
      ? (catalyst.judgmentJson as unknown as JudgmentV2)
      : buildJudgmentV2({
          ...catalyst,
          publishedAt: catalyst.publishedAt.toISOString(),
          rVol: null,
        });

  const version = String(body.judgmentVersion ?? judgment.version ?? "judgment-v2.0");

  await prisma.judgmentFeedback.create({
    data: {
      userId: session.user.id,
      catalystId,
      judgmentVersion: version.slice(0, 40),
      action,
      detail,
      proposedTicker: proposedTicker && /^[A-Z]{1,5}$/.test(proposedTicker) ? proposedTicker : null,
      judgmentSnapshot: {
        grade: judgment.grade,
        catalystStrength: judgment.catalystStrength,
        directionalImplication: judgment.directionalImplication,
        timing: judgment.timing,
        tradeability: judgment.tradeability,
        confidence: judgment.confidence,
        version: judgment.version,
      } as Prisma.InputJsonValue,
    },
  });

  await upsertReviewItem({
    catalystId,
    symbol: catalyst.symbol,
    headline: catalyst.headline,
    judgment,
    reportBump: 1,
  });

  return NextResponse.json({
    ok: true,
    note: "Feedback stored for calibration. Production rules are not auto-updated.",
  });
}
