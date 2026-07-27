import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guard";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import {
  loadUserStrategies,
  saveUserStrategy,
  replaceUserStrategies,
  deleteUserStrategy,
} from "@/lib/alert-strategy/store";
import {
  buildPreset,
  STRATEGY_PRESET_META,
  exportStrategies,
  importStrategies,
  summarizeStrategy,
  validateStrategy,
  parseStrategy,
} from "@/lib/alert-strategy";
import type { StrategyPresetId } from "@/lib/alert-strategy";

export async function GET() {
  const authz = await requireUser();
  if (authz.error) return authz.error;

  const strategies = await loadUserStrategies(authz.user.id);
  return NextResponse.json({
    strategies,
    presets: STRATEGY_PRESET_META,
    summaries: Object.fromEntries(
      strategies.map((s) => [s.id, summarizeStrategy(s)])
    ),
  });
}

export async function POST(req: NextRequest) {
  const authz = await requireUser();
  if (authz.error) return authz.error;

  const ip = clientIp(req);
  const rl = await rateLimit(
    `alert-strategies:post:${ip}:${authz.user.id}`,
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
  const action = typeof body.action === "string" ? body.action : "save";

  if (action === "preset") {
    const presetId = body.presetId as StrategyPresetId;
    const draft = buildPreset(presetId || "custom");
    const result = await saveUserStrategy({
      userId: authz.user.id,
      draft,
      changeNote: `Created from preset ${draft.presetId}`,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, issues: result.issues },
        { status: 400 }
      );
    }
    return NextResponse.json({
      strategy: result.strategy,
      strategies: result.strategies,
      summary: result.strategy ? summarizeStrategy(result.strategy) : null,
    });
  }

  if (action === "import") {
    const imported = importStrategies(body.payload, {
      replaceIds: body.replaceIds !== false,
    });
    if (!imported.strategies.length) {
      return NextResponse.json(
        { error: "Import failed", errors: imported.errors },
        { status: 400 }
      );
    }
    const existing = await loadUserStrategies(authz.user.id);
    const merged = body.merge === false ? imported.strategies : [
      ...existing,
      ...imported.strategies,
    ];
    const result = await replaceUserStrategies({
      userId: authz.user.id,
      strategies: merged,
      changeNote: "JSON import",
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      strategies: result.strategies,
      importErrors: imported.errors,
    });
  }

  if (action === "export") {
    const strategies = await loadUserStrategies(authz.user.id);
    return NextResponse.json(exportStrategies(strategies));
  }

  if (action === "validate") {
    const draft = parseStrategy(body.strategy);
    if (!draft) {
      return NextResponse.json({ error: "Invalid strategy" }, { status: 400 });
    }
    const v = validateStrategy(draft);
    return NextResponse.json({
      ...v,
      summary: summarizeStrategy(draft),
    });
  }

  // default: save one strategy
  const draft = parseStrategy(body.strategy);
  if (!draft) {
    return NextResponse.json({ error: "Invalid strategy" }, { status: 400 });
  }
  const result = await saveUserStrategy({
    userId: authz.user.id,
    draft,
    expectedVersion:
      body.expectedVersion !== undefined ? Number(body.expectedVersion) : draft.version,
    changeNote: typeof body.changeNote === "string" ? body.changeNote : null,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, issues: result.issues },
      { status: result.error?.includes("Version conflict") ? 409 : 400 }
    );
  }
  return NextResponse.json({
    strategy: result.strategy,
    strategies: result.strategies,
    summary: result.strategy ? summarizeStrategy(result.strategy) : null,
  });
}

export async function DELETE(req: NextRequest) {
  const authz = await requireUser();
  if (authz.error) return authz.error;

  const ip = clientIp(req);
  const rl = await rateLimit(
    `alert-strategies:del:${ip}:${authz.user.id}`,
    30,
    60_000
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(rl, 30) }
    );
  }

  const { searchParams } = new URL(req.url);
  const strategyId = searchParams.get("id");
  if (!strategyId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const result = await deleteUserStrategy(authz.user.id, strategyId);
  return NextResponse.json(result);
}
