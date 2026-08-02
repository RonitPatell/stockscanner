import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-guard";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import {
  applyReplayControl,
  getReplayPlayerView,
  getReplaySession,
  listReplaySessions,
  saveReplaySession,
} from "@/lib/monitor/replay-registry";
import { sanitizeReplaySession } from "@/lib/monitor/sanitize-replay-session";
import type { ReplaySpeed } from "@/domain/monitor/replay";
import { isMonitorReplayV1Enabled } from "@/lib/monitor/flags";

export const dynamic = "force-dynamic";

const RL_GET = 60;
const RL_POST = 120;
const RL_SAVE = 10;
const WINDOW_MS = 60_000;

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  if (!isMonitorReplayV1Enabled()) {
    return NextResponse.json(
      { error: "monitorReplayV1 disabled" },
      { status: 503 }
    );
  }

  const rl = await rateLimit(
    `admin-monitor-replay:get:${gate.user.id}:${clientIp(req)}`,
    RL_GET,
    WINDOW_MS,
    { strict: true }
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(rl, RL_GET) }
    );
  }

  const id = req.nextUrl.searchParams.get("id");
  const view = req.nextUrl.searchParams.get("view") ?? "list";

  if (id && view === "player") {
    const player = await getReplayPlayerView(id);
    if (!player) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(player);
  }

  if (id) {
    const session = await getReplaySession(id);
    if (!session) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({
      id: session.id,
      schemaVersion: session.schemaVersion,
      createdAtMs: session.createdAtMs,
      fromMs: session.fromMs,
      toMs: session.toMs,
      symbolScope: session.symbolScope,
      meta: session.meta,
      frameCount: session.frames.length,
      frames: session.frames.slice(0, 200),
    });
  }

  return NextResponse.json({ sessions: await listReplaySessions() });
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const rec = body as Record<string, unknown>;
  const action = typeof rec.action === "string" ? rec.action : "";
  const ip = clientIp(req);

  if (action === "save_session") {
    const rl = await rateLimit(
      `admin-monitor-replay:save:${gate.user.id}:${ip}`,
      RL_SAVE,
      WINDOW_MS,
      { strict: true }
    );
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: rateLimitHeaders(rl, RL_SAVE) }
      );
    }
    const sanitized = sanitizeReplaySession(rec.session);
    if (!sanitized.ok) {
      return NextResponse.json({ error: sanitized.error }, { status: 400 });
    }
    await saveReplaySession(sanitized.session);
    return NextResponse.json({ ok: true, id: sanitized.session.id });
  }

  const rl = await rateLimit(
    `admin-monitor-replay:post:${gate.user.id}:${ip}`,
    RL_POST,
    WINDOW_MS,
    { strict: true }
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(rl, RL_POST) }
    );
  }

  const sessionId = typeof rec.sessionId === "string" ? rec.sessionId : "";
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId_required" }, { status: 400 });
  }

  const speeds = new Set([1, 2, 5]);
  let control:
    | { type: "play" }
    | { type: "pause" }
    | { type: "speed"; speed: ReplaySpeed }
    | { type: "step_forward" }
    | { type: "step_backward" }
    | { type: "seek"; cursorMs: number }
    | { type: "tick"; elapsedWallMs: number }
    | null = null;

  switch (action) {
    case "play":
      control = { type: "play" };
      break;
    case "pause":
      control = { type: "pause" };
      break;
    case "speed": {
      const speed = Number(rec.speed);
      if (!speeds.has(speed)) {
        return NextResponse.json({ error: "invalid_speed" }, { status: 400 });
      }
      control = { type: "speed", speed: speed as ReplaySpeed };
      break;
    }
    case "step_forward":
      control = { type: "step_forward" };
      break;
    case "step_backward":
      control = { type: "step_backward" };
      break;
    case "seek": {
      const cursorMs = Number(rec.cursorMs);
      if (!Number.isFinite(cursorMs)) {
        return NextResponse.json({ error: "invalid_cursor" }, { status: 400 });
      }
      control = { type: "seek", cursorMs };
      break;
    }
    case "tick": {
      const elapsedWallMs = Number(rec.elapsedWallMs);
      if (!Number.isFinite(elapsedWallMs) || elapsedWallMs < 0) {
        return NextResponse.json({ error: "invalid_elapsed" }, { status: 400 });
      }
      control = { type: "tick", elapsedWallMs };
      break;
    }
    default:
      return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  }

  const view = await applyReplayControl(sessionId, control);
  if (!view) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(view);
}
