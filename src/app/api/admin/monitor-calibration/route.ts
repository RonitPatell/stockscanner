import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-guard";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import {
  alignFramesForShadow,
  compareShadowPairs,
  computeCalibrationReport,
} from "@/domain/monitor/calibration";
import { getReplaySession } from "@/lib/monitor/replay-registry";

export const dynamic = "force-dynamic";

const RL_LIMIT = 40;
const WINDOW_MS = 60_000;

const FORBIDDEN_KEYS = [
  "predictedProfit",
  "expectedReturn",
  "probabilityOfWinning",
  "winProbability",
  "targetPrice",
  "predicted_profit",
  "expected_return",
  "target_price",
] as const;

function assertNoForbiddenFields(payload: unknown): void {
  const walk = (node: unknown): void => {
    if (node == null) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (typeof node !== "object") return;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if ((FORBIDDEN_KEYS as readonly string[]).includes(key)) {
        throw new Error(`forbidden_calibration_field:${key}`);
      }
      walk(value);
    }
  };
  walk(payload);
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const rl = await rateLimit(
    `admin-monitor-cal:get:${gate.user.id}:${clientIp(req)}`,
    RL_LIMIT,
    WINDOW_MS,
    { strict: true }
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(rl, RL_LIMIT) }
    );
  }

  const sessionId = req.nextUrl.searchParams.get("sessionId") ?? "fixture-monitor-replay-v1";
  const session = await getReplaySession(sessionId);
  if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const report = computeCalibrationReport(session);
  try {
    assertNoForbiddenFields(report);
  } catch (e) {
    console.error("[monitor-calibration]", e);
    return NextResponse.json({ error: "report_rejected" }, { status: 500 });
  }

  return NextResponse.json(report);
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const rl = await rateLimit(
    `admin-monitor-cal:post:${gate.user.id}:${clientIp(req)}`,
    RL_LIMIT,
    WINDOW_MS,
    { strict: true }
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(rl, RL_LIMIT) }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (rec.action !== "shadow_compare") {
    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  }

  const productionId =
    typeof rec.productionSessionId === "string"
      ? rec.productionSessionId
      : "fixture-monitor-replay-v1";
  const candidateId =
    typeof rec.candidateSessionId === "string"
      ? rec.candidateSessionId
      : `${productionId}-candidate`;

  const [production, candidate] = await Promise.all([
    getReplaySession(productionId),
    getReplaySession(candidateId),
  ]);
  if (!production || !candidate) {
    return NextResponse.json({ error: "session_not_found" }, { status: 404 });
  }

  const pairs = alignFramesForShadow(production.frames, candidate.frames);
  const report = compareShadowPairs({
    productionEngine:
      production.frames[0]?.versions.momentum ?? production.schemaVersion,
    candidateEngine:
      candidate.frames[0]?.versions.momentum ?? candidate.schemaVersion,
    pairs,
  });

  try {
    assertNoForbiddenFields(report);
  } catch (e) {
    console.error("[monitor-calibration-shadow]", e);
    return NextResponse.json({ error: "report_rejected" }, { status: 500 });
  }

  return NextResponse.json({
    ...report,
    productionSessionId: productionId,
    candidateSessionId: candidateId,
  });
}
