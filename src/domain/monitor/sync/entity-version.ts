/**
 * Entity-version gating: ignore stale per-symbol versions.
 * Hub uses per-symbol `sequence` as the entity version.
 */

export interface VersionedEntity {
  symbol: string;
  /** Monotonic per-entity version (symbol slot sequence). */
  entityVersion: number;
}

export function shouldApplyEntityVersion(
  prevVersion: number | null | undefined,
  nextVersion: number
): boolean {
  if (!Number.isFinite(nextVersion)) return false;
  if (prevVersion == null) return true;
  // Same version is not progress — treat as already-applied / duplicate.
  return nextVersion > prevVersion;
}

/** Deduplicate by global event id; keep first occurrence in order. */
export function dedupeByEventId<T extends { eventId: string | number }>(
  events: T[]
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const e of events) {
    const id = String(e.eventId);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(e);
  }
  return out;
}

/**
 * Sort by event id ascending, drop duplicates, drop entity updates that
 * regress version for the same symbol.
 */
export function orderDedupeAndFilterStaleEntities<
  T extends {
    eventId: number;
    symbol?: string;
    entityVersion?: number;
  },
>(events: T[]): T[] {
  const sorted = [...events].sort((a, b) => a.eventId - b.eventId);
  const byEvent = dedupeByEventId(
    sorted.map((e) => ({ ...e, eventId: e.eventId }))
  );
  const entityMax = new Map<string, number>();
  const out: T[] = [];
  for (const e of byEvent) {
    if (e.symbol != null && e.entityVersion != null) {
      const prev = entityMax.get(e.symbol.toUpperCase());
      if (!shouldApplyEntityVersion(prev, e.entityVersion)) continue;
      entityMax.set(e.symbol.toUpperCase(), e.entityVersion);
    }
    out.push(e as T);
  }
  return out;
}
