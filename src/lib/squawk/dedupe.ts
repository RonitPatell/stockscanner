import type { SquawkUtterance } from "./types.ts";

/**
 * Deduplicate related headlines by storyClusterId (preferred) or symbol+fingerprint.
 * Enrichment with same catalyst id updates rather than repeats.
 */
export function dedupeKey(u: {
  catalystId: string;
  storyClusterId?: string | null;
  symbol: string;
}): string {
  if (u.storyClusterId) return `cluster:${u.storyClusterId}`;
  return `catalyst:${u.catalystId}`;
}

export type DedupeDecision =
  | { action: "speak_new" }
  | { action: "skip_duplicate" }
  | { action: "update"; previous: SquawkUtterance };

export function decideDedupe(
  incoming: SquawkUtterance,
  previous: SquawkUtterance | null | undefined
): DedupeDecision {
  if (!previous) return { action: "speak_new" };

  // Same catalyst enrichment → update script, don't full-repeat if identical
  if (previous.catalystId === incoming.catalystId) {
    if (previous.contentFingerprint === incoming.contentFingerprint) {
      return { action: "skip_duplicate" };
    }
    return { action: "update", previous };
  }

  // Same story cluster different headline → skip if already spoken
  if (
    previous.storyClusterId &&
    incoming.storyClusterId &&
    previous.storyClusterId === incoming.storyClusterId
  ) {
    if (previous.contentFingerprint === incoming.contentFingerprint) {
      return { action: "skip_duplicate" };
    }
    // Related enrichment of same story — update
    return { action: "update", previous };
  }

  return { action: "speak_new" };
}
