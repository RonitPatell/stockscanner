import type { LatencyTotals } from "./types.ts";
import { diffMs } from "./timestamps.ts";

export function computeLatencyTotals(input: {
  providerPublishedAt?: Date | null;
  firstFetchedAt?: Date | null;
  fetchCompletedAt?: Date | null;
  classifiedAt?: Date | null;
  persistedAt?: Date | null;
  ssePublishedAt?: Date | null;
  firstDeliveryAttemptAt?: Date | null;
}): LatencyTotals {
  const fetchLatencyMs = diffMs(input.fetchCompletedAt, input.firstFetchedAt);
  const processingLatencyMs = diffMs(input.persistedAt, input.fetchCompletedAt);
  const deliveryLatencyMs = diffMs(
    input.firstDeliveryAttemptAt ?? input.ssePublishedAt,
    input.persistedAt
  );
  const totalLatencyMs = diffMs(
    input.firstDeliveryAttemptAt ?? input.ssePublishedAt ?? input.persistedAt,
    input.providerPublishedAt ?? input.firstFetchedAt
  );
  return { fetchLatencyMs, processingLatencyMs, deliveryLatencyMs, totalLatencyMs };
}
