/**
 * Bound admin-uploaded Monitor Replay sessions before persistence.
 */

import {
  MONITOR_REPLAY_VERSION,
  type MonitorReplaySession,
} from "../../domain/monitor/replay/index.ts";

const MAX_FRAMES = 5_000;
const MAX_SYMBOLS = 200;
const MAX_ID_LEN = 128;
const MAX_RAW_JSON_CHARS = 2_000_000;

export function sanitizeReplaySession(
  raw: unknown
): { ok: true; session: MonitorReplaySession } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "invalid_session" };
  }
  try {
    if (JSON.stringify(raw).length > MAX_RAW_JSON_CHARS) {
      return { ok: false, error: "payload_too_large" };
    }
  } catch {
    return { ok: false, error: "payload_unreadable" };
  }

  const s = raw as Record<string, unknown>;
  const id = typeof s.id === "string" ? s.id.trim().slice(0, MAX_ID_LEN) : "";
  if (!id || !/^[\w.-]+$/.test(id)) {
    return { ok: false, error: "invalid_session_id" };
  }
  if (!Array.isArray(s.frames)) {
    return { ok: false, error: "invalid_frames" };
  }
  if (s.frames.length > MAX_FRAMES) {
    return { ok: false, error: "too_many_frames" };
  }

  const fromMs = Number(s.fromMs);
  const toMs = Number(s.toMs);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) {
    return { ok: false, error: "invalid_time_bounds" };
  }

  const symbolScope = Array.isArray(s.symbolScope)
    ? s.symbolScope
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.toUpperCase().slice(0, 16))
        .slice(0, MAX_SYMBOLS)
    : [];

  const meta =
    s.meta && typeof s.meta === "object"
      ? (s.meta as MonitorReplaySession["meta"])
      : {
          maxFrames: MAX_FRAMES,
          minIntervalMs: 1000,
          note: "admin upload",
        };

  const session: MonitorReplaySession = {
    id,
    schemaVersion:
      typeof s.schemaVersion === "string"
        ? s.schemaVersion.slice(0, 64)
        : MONITOR_REPLAY_VERSION,
    createdAtMs:
      Number.isFinite(Number(s.createdAtMs)) && Number(s.createdAtMs) > 0
        ? Number(s.createdAtMs)
        : Date.now(),
    fromMs,
    toMs,
    symbolScope,
    frames: s.frames.slice(0, MAX_FRAMES) as MonitorReplaySession["frames"],
    meta: {
      maxFrames: Math.min(Number(meta.maxFrames) || MAX_FRAMES, MAX_FRAMES),
      minIntervalMs: Math.max(0, Number(meta.minIntervalMs) || 1000),
      note: typeof meta.note === "string" ? meta.note.slice(0, 200) : "admin upload",
    },
  };

  return { ok: true, session };
}
