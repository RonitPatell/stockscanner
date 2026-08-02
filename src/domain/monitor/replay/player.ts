/**
 * Deterministic replay player: 1x / 2x / 5x / step.
 * Cursor advances only over historical asOfMs — never exposes future frames.
 */

import { framesAsOf } from "./record.ts";
import type {
  MonitorReplayFrame,
  MonitorReplaySession,
  ReplayPlayerState,
  ReplaySpeed,
} from "./types.ts";

export function createPlayerState(session: MonitorReplaySession): ReplayPlayerState {
  return {
    sessionId: session.id,
    cursorMs: session.fromMs,
    speed: 1,
    index: 0,
    playing: false,
    visibleCount: framesAsOf(session, session.fromMs).length,
  };
}

export function setSpeed(state: ReplayPlayerState, speed: ReplaySpeed): ReplayPlayerState {
  return { ...state, speed };
}

export function play(state: ReplayPlayerState): ReplayPlayerState {
  return { ...state, playing: true };
}

export function pause(state: ReplayPlayerState): ReplayPlayerState {
  return { ...state, playing: false };
}

/**
 * Advance wall-clock simulation by `elapsedWallMs * speed` of session time.
 * Only frames with asOfMs <= new cursor become visible.
 */
export function tick(
  session: MonitorReplaySession,
  state: ReplayPlayerState,
  elapsedWallMs: number
): ReplayPlayerState {
  if (!state.playing || elapsedWallMs <= 0) {
    return syncVisible(session, state);
  }
  const delta = elapsedWallMs * state.speed;
  const cursorMs = Math.min(session.toMs, state.cursorMs + delta);
  return syncVisible(session, { ...state, cursorMs });
}

/** Move to next distinct asOfMs frame boundary (any symbol). */
export function stepForward(
  session: MonitorReplaySession,
  state: ReplayPlayerState
): ReplayPlayerState {
  const next = session.frames.find((f) => f.asOfMs > state.cursorMs);
  if (!next) {
    return syncVisible(session, {
      ...state,
      cursorMs: session.toMs,
      playing: false,
    });
  }
  return syncVisible(session, {
    ...state,
    cursorMs: next.asOfMs,
    playing: false,
  });
}

/** Move to previous distinct asOfMs. */
export function stepBackward(
  session: MonitorReplaySession,
  state: ReplayPlayerState
): ReplayPlayerState {
  let prevMs: number | null = null;
  for (const f of session.frames) {
    if (f.asOfMs < state.cursorMs) prevMs = f.asOfMs;
    else break;
  }
  const cursorMs = prevMs ?? session.fromMs;
  return syncVisible(session, { ...state, cursorMs, playing: false });
}

export function seek(
  session: MonitorReplaySession,
  state: ReplayPlayerState,
  cursorMs: number
): ReplayPlayerState {
  const clamped = Math.max(session.fromMs, Math.min(session.toMs, cursorMs));
  return syncVisible(session, { ...state, cursorMs: clamped, playing: false });
}

function syncVisible(
  session: MonitorReplaySession,
  state: ReplayPlayerState
): ReplayPlayerState {
  const visible = framesAsOf(session, state.cursorMs);
  const index = Math.max(0, visible.length - 1);
  return {
    ...state,
    index,
    visibleCount: visible.length,
  };
}

/**
 * Assert no look-ahead: every returned frame.asOfMs <= cursorMs.
 * Throws if a future frame is present (defensive for store corruption).
 */
export function assertNoLookahead(frames: MonitorReplayFrame[], cursorMs: number): void {
  for (const f of frames) {
    if (f.asOfMs > cursorMs) {
      throw new Error(
        `look-ahead leakage: frame ${f.symbol}@${f.asOfMs} > cursor ${cursorMs}`
      );
    }
  }
}

export function visibleFrames(
  session: MonitorReplaySession,
  state: ReplayPlayerState
): MonitorReplayFrame[] {
  const frames = framesAsOf(session, state.cursorMs);
  assertNoLookahead(frames, state.cursorMs);
  return frames;
}
