/**
 * Process-local Monitor Replay session registry (admin tooling).
 * Compact sessions only — not an indefinite tick store.
 */

import { MemoryReplayStore } from "@/domain/monitor/replay";
import type { MonitorReplaySession, ReplayPlayerState } from "@/domain/monitor/replay";
import {
  createPlayerState,
  pause,
  play,
  seek,
  setSpeed,
  stepBackward,
  stepForward,
  tick,
  visibleFrames,
  type ReplaySpeed,
} from "@/domain/monitor/replay";
import {
  buildCandidateShadowSession,
  buildFixtureReplaySession,
} from "@/lib/monitor/replay-fixtures";

const g = globalThis as typeof globalThis & {
  __ttMonitorReplayStore?: MemoryReplayStore;
  __ttMonitorReplayPlayers?: Map<string, ReplayPlayerState>;
  __ttMonitorReplaySeeded?: boolean;
};

function store(): MemoryReplayStore {
  if (!g.__ttMonitorReplayStore) g.__ttMonitorReplayStore = new MemoryReplayStore();
  return g.__ttMonitorReplayStore;
}

function players(): Map<string, ReplayPlayerState> {
  if (!g.__ttMonitorReplayPlayers) g.__ttMonitorReplayPlayers = new Map();
  return g.__ttMonitorReplayPlayers;
}

export async function ensureReplaySeeded(): Promise<void> {
  if (g.__ttMonitorReplaySeeded) return;
  const s = store();
  const existing = await s.getSession("fixture-monitor-replay-v1");
  if (!existing) {
    const fixture = buildFixtureReplaySession();
    await s.saveSession(fixture);
    await s.saveSession(buildCandidateShadowSession(fixture));
  }
  g.__ttMonitorReplaySeeded = true;
}

export async function listReplaySessions() {
  await ensureReplaySeeded();
  const sessions = await store().listSessions({ limit: 100 });
  return sessions.map((s) => ({
    id: s.id,
    schemaVersion: s.schemaVersion,
    createdAtMs: s.createdAtMs,
    fromMs: s.fromMs,
    toMs: s.toMs,
    symbolScope: s.symbolScope,
    frameCount: s.frames.length,
    meta: s.meta,
  }));
}

export async function getReplaySession(id: string): Promise<MonitorReplaySession | null> {
  await ensureReplaySeeded();
  return store().getSession(id);
}

export async function saveReplaySession(session: MonitorReplaySession): Promise<void> {
  await ensureReplaySeeded();
  await store().saveSession(session);
}

function getOrCreatePlayer(session: MonitorReplaySession): ReplayPlayerState {
  const map = players();
  const existing = map.get(session.id);
  if (existing) return existing;
  const created = createPlayerState(session);
  map.set(session.id, created);
  return created;
}

export async function getReplayPlayerView(sessionId: string) {
  const session = await getReplaySession(sessionId);
  if (!session) return null;
  const state = getOrCreatePlayer(session);
  const frames = visibleFrames(session, state);
  return {
    session: {
      id: session.id,
      fromMs: session.fromMs,
      toMs: session.toMs,
      symbolScope: session.symbolScope,
      frameCount: session.frames.length,
      schemaVersion: session.schemaVersion,
    },
    player: state,
    visibleFrames: frames.slice(-40),
    latestBySymbol: Object.fromEntries(
      [...frames]
        .reverse()
        .reduce((m, f) => {
          if (!m.has(f.symbol)) m.set(f.symbol, f);
          return m;
        }, new Map<string, (typeof frames)[number]>())
        .entries()
    ),
  };
}

export async function applyReplayControl(
  sessionId: string,
  action:
    | { type: "play" }
    | { type: "pause" }
    | { type: "speed"; speed: ReplaySpeed }
    | { type: "step_forward" }
    | { type: "step_backward" }
    | { type: "seek"; cursorMs: number }
    | { type: "tick"; elapsedWallMs: number }
) {
  const session = await getReplaySession(sessionId);
  if (!session) return null;
  let state = getOrCreatePlayer(session);
  switch (action.type) {
    case "play":
      state = play(state);
      break;
    case "pause":
      state = pause(state);
      break;
    case "speed":
      state = setSpeed(state, action.speed);
      break;
    case "step_forward":
      state = stepForward(session, state);
      break;
    case "step_backward":
      state = stepBackward(session, state);
      break;
    case "seek":
      state = seek(session, state, action.cursorMs);
      break;
    case "tick":
      state = tick(session, state, action.elapsedWallMs);
      break;
  }
  players().set(sessionId, state);
  return getReplayPlayerView(sessionId);
}
