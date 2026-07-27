import type { CatalystItem } from "@/types";
import {
  buildAlertEventId,
  enqueueAlertJob,
  isAlertBackboneV2Enabled,
  isPreliminaryPublishEnabled,
  isProviderTimestampUnreliable,
  mapSourceToQueue,
  recordDeliveryLifecycle,
  upsertAlertEventVersion,
} from "./index.ts";

/**
 * After a verified headline is persisted, register event v1 and enqueue
 * enrichment without blocking feed publication.
 */
export async function registerPreliminaryAlertEvent(input: {
  item: CatalystItem;
  rawNewsId: string;
  timestampQuality?: string | null;
}): Promise<{ eventId: string; version: number } | null> {
  if (!isAlertBackboneV2Enabled()) return null;

  const { item, rawNewsId } = input;
  const eventId = buildAlertEventId({
    providerItemId: rawNewsId,
    url: item.sourceUrl,
    title: item.headline,
    ticker: item.symbol,
    publishedAt: new Date(item.publishedAt),
  });

  const queue = mapSourceToQueue({
    source: item.source,
    sourceTier: item.sourceTier,
    isSec: item.source === "SEC EDGAR" || rawNewsId.startsWith("sec-"),
  });

  const unreliable = isProviderTimestampUnreliable(input.timestampQuality);

  const envelope = await upsertAlertEventVersion({
    eventId,
    queue,
    catalystId: item.id,
    rawNewsId,
    symbol: item.symbol,
    headline: item.headline,
    source: item.source,
    sourceTier: item.sourceTier ?? null,
    publishedAt: item.publishedAt,
    timestampQuality: input.timestampQuality ?? null,
    providerTimestampUnreliable: unreliable,
    phase: "preliminary",
    enrichmentHints: {
      needsQuote: true,
      needsHistorical: true,
      needsDilution: /sec|424|s-1|s-3/i.test(item.source + item.headline),
      needsRvol: true,
    },
  });

  await recordDeliveryLifecycle({
    eventId,
    eventVersion: envelope.version,
    catalystId: item.id,
    channel: "browser",
    status: "accepted",
  });

  if (isPreliminaryPublishEnabled()) {
    await enqueueAlertJob({
      ...envelope,
      queue: "enrichment",
      phase: "preliminary",
    });
  }

  return { eventId: envelope.eventId, version: envelope.version };
}

export async function markBrowserDelivered(input: {
  eventId: string;
  version: number;
  catalystId: string;
}): Promise<void> {
  await recordDeliveryLifecycle({
    eventId: input.eventId,
    eventVersion: input.version,
    catalystId: input.catalystId,
    channel: "browser",
    status: "delivered",
  });
}
