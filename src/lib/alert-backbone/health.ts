import { INGEST_SOURCES } from "../ingest/sources.ts";
import { isSourceFlagEnabled } from "../ingest/flags.ts";
import { listDeadLetters } from "../ingest/dlq.ts";
import { getSourceHealth } from "../ingest/health.ts";
import { listSourceHeartbeats, getDataGapsThisHour } from "./heartbeats.ts";
import { getQueueDepths, listDlq } from "./queues.ts";
import { getBackboneMetricsSummary } from "./metrics.ts";
import { listRecentDeliveries, channelSuccessRates } from "./delivery-log.ts";
import { ALERT_QUEUE_CLASSES } from "./types.ts";
import { listRecentProbes } from "./probes.ts";

export async function getAlertBackboneHealthDashboard(hours = 24) {
  const sourceIds = INGEST_SOURCES.map((s) => s.id);
  const [
    metrics,
    heartbeats,
    queues,
    deliveries,
    channels,
    gaps,
    ingestDlq,
    probes,
    ingestHealth,
  ] = await Promise.all([
    getBackboneMetricsSummary(hours),
    listSourceHeartbeats(sourceIds),
    getQueueDepths(),
    listRecentDeliveries(50),
    channelSuccessRates(hours),
    getDataGapsThisHour(),
    listDeadLetters(20),
    listRecentProbes(20),
    Promise.all(
      INGEST_SOURCES.map(async (s) =>
        getSourceHealth(s.id, {
          tier: s.tier,
          enabled: isSourceFlagEnabled(s),
        })
      )
    ),
  ]);

  const queueDlqs: Record<string, unknown[]> = {};
  for (const q of ALERT_QUEUE_CLASSES) {
    queueDlqs[q] = await listDlq(q, 10);
  }

  return {
    generatedAt: new Date().toISOString(),
    hours,
    sources: {
      heartbeats,
      ingestHealth,
      dataGapsThisHour: gaps,
    },
    channels: {
      successRates: channels,
      recentDeliveries: deliveries,
    },
    queues,
    queueDlqs,
    ingestDlq,
    probes,
    metrics,
    disclaimer:
      "Health dashboard shows measured local/staging/production samples. Configured targets are not claims of achievement.",
  };
}
