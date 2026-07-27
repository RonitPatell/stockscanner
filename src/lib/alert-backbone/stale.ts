import { getStaleAgeLimitsMs } from "./targets.ts";
import type { AlertQueueClass } from "./types.ts";

export function isAlertStale(input: {
  publishedAt: Date | string;
  queue: AlertQueueClass | string;
  now?: number;
}): boolean {
  const limits = getStaleAgeLimitsMs();
  const maxAge =
    limits[input.queue] ?? limits.default ?? 2 * 60 * 60_000;
  const published =
    typeof input.publishedAt === "string"
      ? new Date(input.publishedAt).getTime()
      : input.publishedAt.getTime();
  if (!Number.isFinite(published)) return true;
  const now = input.now ?? Date.now();
  return now - published > maxAge;
}

export function staleReason(input: {
  publishedAt: Date | string;
  queue: AlertQueueClass | string;
  now?: number;
}): string | null {
  if (!isAlertStale(input)) return null;
  const limits = getStaleAgeLimitsMs();
  const maxAge = limits[input.queue] ?? limits.default;
  return `stale_for_category:${input.queue}:maxAgeMs=${maxAge}`;
}
