import type { MonitorSyncAck } from "./types.ts";

const FORBIDDEN_ACK_KEYS = [
  "watchlist",
  "strategy",
  "strategies",
  "password",
  "webhook",
  "email",
  "phone",
  "userId",
  "user_id",
];

/**
 * Build a public sync acknowledgement. Strips any accidental private fields.
 */
export function buildMonitorSyncAck(input: {
  streamConnected: boolean;
  snapshotId: string | null;
  lastEventReceived: string | null;
  lastEventApplied: string | null;
  liveSyncCompleted: boolean;
  sequence: number;
}): MonitorSyncAck {
  return {
    streamConnected: Boolean(input.streamConnected),
    snapshotId: input.snapshotId ? String(input.snapshotId) : null,
    lastEventReceived: input.lastEventReceived
      ? String(input.lastEventReceived)
      : null,
    lastEventApplied: input.lastEventApplied
      ? String(input.lastEventApplied)
      : null,
    liveSyncCompleted: Boolean(input.liveSyncCompleted),
    sequence: Number.isFinite(input.sequence) ? Math.max(0, input.sequence) : 0,
  };
}

export function assertAckHasNoPrivateFields(
  ack: Record<string, unknown>
): string[] {
  const bad: string[] = [];
  for (const key of Object.keys(ack)) {
    const lower = key.toLowerCase();
    if (FORBIDDEN_ACK_KEYS.some((f) => lower.includes(f))) {
      bad.push(key);
    }
  }
  return bad;
}
