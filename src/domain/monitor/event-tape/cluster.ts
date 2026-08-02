import { EVENT_TAPE_CONFIG } from "./config.ts";
import type { MonitorTapeItem, TapeSourceType } from "./types.ts";

/** Source types that can share a cluster window on the same symbol. */
const CLUSTERABLE: ReadonlySet<TapeSourceType> = new Set([
  "catalyst",
  "momentum",
  "market_structure",
  "halt",
  "risk",
  "data_quality",
]);

export interface ClusterState {
  /** clusterId → member ids (newest last) */
  members: Map<string, string[]>;
  /** symbol|sourceType → open cluster { id, lastAtMs } */
  open: Map<string, { id: string; lastAtMs: number }>;
}

export function createClusterState(): ClusterState {
  return { members: new Map(), open: new Map() };
}

function openKey(symbol: string, sourceType: TapeSourceType): string {
  return `${symbol}|${sourceType}`;
}

/**
 * Assign or extend a cluster for related same-symbol events.
 * Mutates item.clusterId / clusterMemberIds; returns cluster id if clustered.
 */
export function assignCluster(
  item: MonitorTapeItem,
  state: ClusterState,
  opts?: { windowMs?: number; maxMembers?: number }
): string | null {
  if (!CLUSTERABLE.has(item.sourceType)) {
    item.clusterId = null;
    item.clusterMemberIds = [item.id];
    return null;
  }

  const windowMs = opts?.windowMs ?? EVENT_TAPE_CONFIG.clusterWindowMs;
  const maxMembers = opts?.maxMembers ?? EVENT_TAPE_CONFIG.clusterMaxMembers;
  const key = openKey(item.symbol, item.sourceType);
  const open = state.open.get(key);

  let clusterId: string;
  if (open && item.atMs - open.lastAtMs <= windowMs) {
    clusterId = open.id;
    open.lastAtMs = item.atMs;
  } else {
    clusterId = `cl_${item.symbol}_${item.sourceType}_${item.atMs}`;
    state.open.set(key, { id: clusterId, lastAtMs: item.atMs });
    state.members.set(clusterId, []);
  }

  const list = state.members.get(clusterId) ?? [];
  list.push(item.id);
  while (list.length > maxMembers) list.shift();
  state.members.set(clusterId, list);

  item.clusterId = clusterId;
  item.clusterMemberIds = [...list];
  return clusterId;
}

/** Refresh clusterMemberIds on older items in the same cluster (optional post-pass). */
export function syncClusterMembers(
  items: MonitorTapeItem[],
  clusterId: string,
  memberIds: string[]
): void {
  for (const it of items) {
    if (it.clusterId === clusterId) {
      it.clusterMemberIds = [...memberIds];
    }
  }
}
