import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-guard";
import {
  getSourceHealth,
  INGEST_SOURCES,
  isSourceFlagEnabled,
  listDeadLetters,
  getDeadLetter,
  removeDeadLetter,
  retrySourceById,
  getMarketPhase,
  intervalForPhase,
} from "@/lib/ingest";
import { ingestAndAnalyzeNews, refreshPublicFeedCache } from "@/lib/catalyst-engine";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const phase = getMarketPhase();
  const sources = await Promise.all(
    INGEST_SOURCES.map(async (s) => {
      const health = await getSourceHealth(s.id, {
        tier: s.tier,
        enabled: isSourceFlagEnabled(s),
      });
      return {
        ...health,
        name: s.name,
        provider: s.provider,
        partition: s.partition,
        featureFlag: s.featureFlag,
        intervalMs: intervalForPhase(s.intervals, phase),
        intervals: s.intervals,
        isSec: !!s.isSec,
      };
    })
  );

  const dlq = await listDeadLetters(50);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    marketPhase: phase,
    note:
      "Intervals are adaptive by market phase. Do not treat any source as a fixed 2s poll unless that interval is explicitly configured, sustainable, and measured.",
    sources,
    deadLetters: dlq,
  });
}

/** Admin actions: retry DLQ item or force-run a source. */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  let body: { action?: string; id?: string; sourceId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action === "retry_dlq" && body.id) {
    const item = await getDeadLetter(body.id);
    if (!item) {
      return NextResponse.json({ error: "DLQ item not found" }, { status: 404 });
    }
    const tick = await retrySourceById(item.sourceId);
    if (tick.status === "ok" && tick.articles.length > 0) {
      const batch = await ingestAndAnalyzeNews({
        articles: tick.articles,
        wireOnly: item.tier <= 1,
        fast: true,
      });
      if (batch.newCount > 0) await refreshPublicFeedCache();
      await removeDeadLetter(body.id);
      return NextResponse.json({
        ok: true,
        action: "retry_dlq",
        sourceId: item.sourceId,
        ingested: batch.newCount,
        fetched: tick.articles.length,
      });
    }
    if (tick.status === "ok") {
      await removeDeadLetter(body.id);
    }
    return NextResponse.json({
      ok: tick.status === "ok",
      action: "retry_dlq",
      sourceId: item.sourceId,
      status: tick.status,
      reason: tick.reason ?? null,
    });
  }

  if (body.action === "retry_source" && body.sourceId) {
    const tick = await retrySourceById(body.sourceId);
    if (tick.status === "ok" && tick.articles.length > 0) {
      const def = INGEST_SOURCES.find((s) => s.id === body.sourceId);
      const batch = await ingestAndAnalyzeNews({
        articles: tick.articles,
        wireOnly: (def?.tier ?? 3) <= 1,
        fast: true,
      });
      if (batch.newCount > 0) await refreshPublicFeedCache();
      return NextResponse.json({
        ok: true,
        action: "retry_source",
        sourceId: body.sourceId,
        ingested: batch.newCount,
        fetched: tick.articles.length,
      });
    }
    return NextResponse.json({
      ok: tick.status === "ok",
      action: "retry_source",
      sourceId: body.sourceId,
      status: tick.status,
      reason: tick.reason ?? null,
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
