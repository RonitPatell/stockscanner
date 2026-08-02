import type { MonitorLadderSnapshot } from "@/domain/monitor/delivery";
import type { MonitorPublicSnapshot } from "@/domain/monitor/snapshot";
import { publicSnapshotToLadderSnapshot } from "@/lib/monitor/snapshot/to-delivery";

/** Seed client runtime from SSR public snapshot (no extra HTTP round-trip). */
export function publicSnapshotToDeliveryLadder(
  snap: MonitorPublicSnapshot
): MonitorLadderSnapshot {
  return publicSnapshotToLadderSnapshot(snap);
}
