import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import {
  parseDecisionRecord,
  scrubFeedbackAnalyticsProps,
  type TraderDecisionRecord,
} from "@/lib/trader-feedback";

/**
 * Cloud sync for trader feedback — ONLY when User.traderFeedbackSyncOptIn is true.
 * Default is local-only; this route refuses writes without explicit opt-in.
 */

export async function GET() {
  const authz = await requireUser();
  if (authz.error) return authz.error;

  const user = await prisma.user.findUnique({
    where: { id: authz.user.id },
    select: { traderFeedbackSyncOptIn: true },
  });

  if (!user?.traderFeedbackSyncOptIn) {
    return NextResponse.json({
      optedIn: false,
      records: [],
      note: "Cloud sync is off. Records stay on this device until you opt in.",
    });
  }

  const rows = await prisma.traderDecision.findMany({
    where: { userId: authz.user.id },
    orderBy: { decidedAt: "desc" },
    take: 500,
  });

  return NextResponse.json({
    optedIn: true,
    records: rows.map(rowToRecord),
  });
}

export async function POST(req: NextRequest) {
  const authz = await requireUser();
  if (authz.error) return authz.error;

  const ip = clientIp(req);
  const rl = await rateLimit(
    `trader-feedback:${ip}:${authz.user.id}`,
    40,
    60_000
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(rl, 40) }
    );
  }

  const body = await req.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "sync";

  if (action === "opt_in") {
    const optIn = body.optIn === true;
    await prisma.user.update({
      where: { id: authz.user.id },
      data: { traderFeedbackSyncOptIn: optIn },
      select: { id: true },
    });
    if (!optIn) {
      // Opting out does not auto-delete cloud copies — user must DELETE
      return NextResponse.json({
        optedIn: false,
        note: "Sync disabled. Existing cloud copies remain until you delete them.",
      });
    }
    return NextResponse.json({ optedIn: true });
  }

  const user = await prisma.user.findUnique({
    where: { id: authz.user.id },
    select: { traderFeedbackSyncOptIn: true },
  });
  if (!user?.traderFeedbackSyncOptIn) {
    return NextResponse.json(
      {
        error: "Cloud sync is not enabled. Opt in explicitly first.",
        code: "SYNC_NOT_OPTED_IN",
      },
      { status: 403 }
    );
  }

  if (action === "upsert") {
    const record = parseDecisionRecord(body.record);
    if (!record) {
      return NextResponse.json({ error: "Invalid record" }, { status: 400 });
    }
    // Never persist reasonNote free-text that might contain PII beyond short tags
    await prisma.traderDecision.upsert({
      where: {
        userId_localId: { userId: authz.user.id, localId: record.id },
      },
      create: recordToRow(authz.user.id, record),
      update: {
        schemaVersion: record.schemaVersion,
        action: record.action,
        reason: record.reason,
        symbol: record.symbol,
        catalystId: record.catalystId,
        headline: record.headline,
        decidedAt: new Date(record.decidedAt),
        entryPrice: record.entryPrice,
        exitPrice: record.exitPrice,
        positionSize: record.positionSize,
        side: record.side,
        alertId: record.alertId,
        alertRuleId: record.alertRuleId,
        alertStrategyId: record.alertStrategyId,
        contextJson: record.context as unknown as Prisma.InputJsonValue,
        mfePctAfter: record.mfePctAfter,
        maePctAfter: record.maePctAfter,
      },
    });

    return NextResponse.json({
      ok: true,
      meta: scrubFeedbackAnalyticsProps({ action: record.action }),
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const authz = await requireUser();
  if (authz.error) return authz.error;

  const ip = clientIp(req);
  const rl = await rateLimit(
    `trader-feedback-del:${ip}:${authz.user.id}`,
    20,
    60_000
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(rl, 20) }
    );
  }

  const { searchParams } = new URL(req.url);
  const all = searchParams.get("all") === "1";
  const localId = searchParams.get("id");

  if (all) {
    const result = await prisma.traderDecision.deleteMany({
      where: { userId: authz.user.id },
    });
    await prisma.user.update({
      where: { id: authz.user.id },
      data: { traderFeedbackSyncOptIn: false },
      select: { id: true },
    });
    return NextResponse.json({ deleted: result.count, optedIn: false });
  }

  if (!localId) {
    return NextResponse.json({ error: "id or all=1 required" }, { status: 400 });
  }

  await prisma.traderDecision.deleteMany({
    where: { userId: authz.user.id, localId },
  });
  return NextResponse.json({ deleted: 1 });
}

function recordToRow(userId: string, r: TraderDecisionRecord) {
  return {
    userId,
    localId: r.id,
    schemaVersion: r.schemaVersion,
    action: r.action,
    reason: r.reason,
    symbol: r.symbol,
    catalystId: r.catalystId,
    headline: r.headline,
    decidedAt: new Date(r.decidedAt),
    entryPrice: r.entryPrice,
    exitPrice: r.exitPrice,
    positionSize: r.positionSize,
    side: r.side,
    alertId: r.alertId,
    alertRuleId: r.alertRuleId,
    alertStrategyId: r.alertStrategyId,
    contextJson: r.context as unknown as Prisma.InputJsonValue,
    mfePctAfter: r.mfePctAfter,
    maePctAfter: r.maePctAfter,
  };
}

function rowToRecord(row: {
  localId: string;
  schemaVersion: string;
  action: string;
  reason: string | null;
  symbol: string;
  catalystId: string | null;
  headline: string | null;
  decidedAt: Date;
  entryPrice: number | null;
  exitPrice: number | null;
  positionSize: number | null;
  side: string | null;
  alertId: string | null;
  alertRuleId: string | null;
  alertStrategyId: string | null;
  contextJson: unknown;
  mfePctAfter: number | null;
  maePctAfter: number | null;
  updatedAt: Date;
}): TraderDecisionRecord | null {
  return parseDecisionRecord({
    id: row.localId,
    schemaVersion: row.schemaVersion,
    action: row.action,
    reason: row.reason,
    symbol: row.symbol,
    catalystId: row.catalystId,
    headline: row.headline,
    decidedAt: row.decidedAt.toISOString(),
    entryPrice: row.entryPrice,
    exitPrice: row.exitPrice,
    positionSize: row.positionSize,
    side: row.side,
    alertId: row.alertId,
    alertRuleId: row.alertRuleId,
    alertStrategyId: row.alertStrategyId,
    context: row.contextJson,
    mfePctAfter: row.mfePctAfter,
    maePctAfter: row.maePctAfter,
    syncState: "synced",
    updatedAt: row.updatedAt.toISOString(),
    reasonNote: null,
  });
}
