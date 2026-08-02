import type { MonitorReplayFrame, MonitorReplaySession, ReplayStorePort } from "./types.ts";
import { appendCompactFrames } from "./record.ts";

/** In-memory store for tests and local replay. */
export class MemoryReplayStore implements ReplayStorePort {
  private readonly sessions = new Map<string, MonitorReplaySession>();

  async saveSession(session: MonitorReplaySession): Promise<void> {
    this.sessions.set(session.id, structuredClone(session));
  }

  async getSession(id: string): Promise<MonitorReplaySession | null> {
    const s = this.sessions.get(id);
    return s ? structuredClone(s) : null;
  }

  async listSessions(opts?: { limit?: number }): Promise<MonitorReplaySession[]> {
    const all = [...this.sessions.values()].sort((a, b) => b.createdAtMs - a.createdAtMs);
    const lim = opts?.limit ?? 50;
    return all.slice(0, lim).map((s) => structuredClone(s));
  }

  async appendFrames(sessionId: string, frames: MonitorReplayFrame[]): Promise<boolean> {
    const s = this.sessions.get(sessionId);
    if (!s) return false;
    const next = appendCompactFrames(s, frames);
    this.sessions.set(sessionId, next);
    return true;
  }

  clear(): void {
    this.sessions.clear();
  }
}
