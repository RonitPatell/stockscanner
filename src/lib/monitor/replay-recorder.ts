/**
 * Optional live append of compact Monitor Replay frames.
 * Enabled when MONITOR_REPLAY_RECORD=1. Never stores raw ticks — frames only.
 * Does not change user-facing Monitor output.
 */

import {
  appendCompactFrames,
  createReplaySession,
  type MonitorReplayFrame,
} from "@/domain/monitor/replay";
import { getReplaySession, saveReplaySession } from "@/lib/monitor/replay-registry";
import { captureReplayFrame, type LiveCaptureInput } from "@/lib/monitor/capture-replay-frame";

function recordingEnabled(): boolean {
  return process.env.MONITOR_REPLAY_RECORD === "1";
}

function daySessionId(atMs: number): string {
  const d = new Date(atMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `live-${y}${m}${day}`;
}

/** Append one compact frame to today's live session (no-op unless enabled). */
export async function recordLiveReplayFrame(
  input: LiveCaptureInput
): Promise<{ recorded: boolean; sessionId?: string }> {
  if (!recordingEnabled()) return { recorded: false };

  const frame = captureReplayFrame(input);
  const sessionId = daySessionId(frame.asOfMs);
  let session = await getReplaySession(sessionId);
  if (!session) {
    const start = Date.UTC(
      new Date(frame.asOfMs).getUTCFullYear(),
      new Date(frame.asOfMs).getUTCMonth(),
      new Date(frame.asOfMs).getUTCDate()
    );
    session = createReplaySession({
      id: sessionId,
      fromMs: start,
      toMs: start + 24 * 60 * 60_000 - 1,
      symbolScope: [frame.symbol],
      minIntervalMs: Number(process.env.MONITOR_REPLAY_MIN_INTERVAL_MS ?? 1000),
      maxFrames: Number(process.env.MONITOR_REPLAY_MAX_FRAMES ?? 50_000),
      frames: [],
    });
  }
  const scope = new Set(session.symbolScope);
  scope.add(frame.symbol);
  session = {
    ...appendCompactFrames(session, [frame]),
    symbolScope: [...scope],
  };
  await saveReplaySession(session);
  return { recorded: true, sessionId };
}

export async function recordLiveReplayFrames(
  inputs: LiveCaptureInput[]
): Promise<number> {
  if (!recordingEnabled() || inputs.length === 0) return 0;
  let n = 0;
  for (const input of inputs) {
    const r = await recordLiveReplayFrame(input);
    if (r.recorded) n += 1;
  }
  return n;
}

export type { MonitorReplayFrame };
