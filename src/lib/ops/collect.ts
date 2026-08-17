/**
 * Admin ops diagnostics — aggregates checkpoints, stamps, and durable failure counts.
 * Never returns secrets, webhooks, or user PII.
 */

import { prisma } from "../prisma.ts";
import { getJobCheckpoint } from "../cost/job-checkpoint.ts";
import { getSourceHealth } from "../ingest/health.ts";
import { getSystemHealth } from "../system-health.ts";
import { isScaleMode } from "../redis.ts";
import {
  getOpsCounter,
  getOpsStamp,
  type OpsCounterName,
  type OpsStampName,
} from "./stats.ts";

const STAMPS: OpsStampName[] = [
  "sec_ingest_ok",
  "company_event_ok",
  "metrics_normalize_ok",
  "capital_risk_ok",
  "thesis_eval_ok",
  "stripe_webhook_ok",
  "alert_delivery_ok",
  "cron_wire_ok",
  "cron_ingest_ok",
  "cron_13f_ok",
  "cron_filings_ok",
  "cron_metrics_ok",
  "cron_discover_ok",
  "cron_thesis_ok",
  "cron_dilution_ok",
  "cron_briefs_ok",
  "cron_alert_backbone_ok",
  "cron_hydrate_ok",
];

const COUNTERS: OpsCounterName[] = [
  "sec_ingest_fail",
  "company_event_fail",
  "metrics_normalize_fail",
  "capital_risk_fail",
  "thesis_eval_fail",
  "stripe_webhook_fail",
  "alert_delivery_fail",
  "duplicate_suppressed",
  "cron_fail",
];

const CHECKPOINT_JOBS = [
  "cron:metrics-companyfacts",
  "cron:institutional-13f",
  "cron:filings-sections",
  "cron:discover",
] as const;

function iso(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export async function collectAdminOpsDiagnostics(opts?: {
  hours?: number;
}): Promise<Record<string, unknown>> {
  const hours = [24, 72, 168].includes(opts?.hours ?? 24)
    ? (opts!.hours as 24 | 72 | 168)
    : 24;
  const since = new Date(Date.now() - hours * 3600_000);

  const stampEntries = await Promise.all(
    STAMPS.map(async (name) => {
      const s = await getOpsStamp(name);
      return [name, s ? { at: iso(s.at), meta: s.meta ?? null } : null] as const;
    })
  );
  const stamps = Object.fromEntries(stampEntries);

  const counterEntries = await Promise.all(
    COUNTERS.map(async (name) => [name, await getOpsCounter(name)] as const)
  );
  const counters = Object.fromEntries(counterEntries);

  const checkpoints = Object.fromEntries(
    await Promise.all(
      CHECKPOINT_JOBS.map(async (jobId) => {
        const ck = await getJobCheckpoint(jobId);
        return [
          jobId,
          ck
            ? {
                updatedAt: iso(ck.updatedAt),
                cursor: ck.cursor,
                meta: ck.meta ?? null,
              }
            : null,
        ] as const;
      })
    )
  );

  const [
    secHealth,
    alertFails,
    alertSent,
    notifFails,
    notifSent,
    notifBlocked,
    companyEvents,
    pending13f,
  ] = await Promise.all([
    getSourceHealth("sec_edgar", { tier: 0, enabled: true }).catch(() => null),
    prisma.alertLog
      .count({ where: { status: "failed", createdAt: { gte: since } } })
      .catch(() => 0),
    prisma.alertLog
      .count({ where: { status: "sent", createdAt: { gte: since } } })
      .catch(() => 0),
    prisma.notificationDelivery
      .count({ where: { status: "failed", createdAt: { gte: since } } })
      .catch(() => 0),
    prisma.notificationDelivery
      .count({ where: { status: "sent", createdAt: { gte: since } } })
      .catch(() => 0),
    prisma.notificationDelivery
      .count({
        where: {
          status: { in: ["blocked", "cooldown"] },
          createdAt: { gte: since },
        },
      })
      .catch(() => 0),
    prisma.companyEvent
      .findFirst({
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, eventType: true, symbol: true },
      })
      .catch(() => null),
    prisma.institutional13fFiling
      .count({
        where: {
          OR: [{ status: "pending" }, { status: "failed" }],
        },
      })
      .catch(() => 0),
  ]);

  const health = getSystemHealth(isScaleMode());

  return {
    generatedAt: new Date().toISOString(),
    windowHours: hours,
    disclaimer:
      "Admin ops diagnostics — internal only. Not a public SLO claim. Counters may reset without Redis.",
    stamps,
    counters,
    checkpoints,
    ingest: {
      secEdgar: secHealth
        ? {
            lastSuccessAt: secHealth.lastSuccessAt,
            lastFailureAt: secHealth.lastFailureAt,
            consecutiveFailures: secHealth.consecutiveFailures,
            circuit: secHealth.circuit,
            lastItemsReceived: secHealth.lastItemsReceived,
          }
        : null,
      wireInFlight: health.wireInFlight,
      pipelineInFlight: health.pipelineInFlight,
      feedUpdatedAt: health.feedUpdatedAt,
      feedItemCount: health.feedItemCount,
    },
    events: {
      lastCompanyEventAt: companyEvents?.createdAt?.toISOString() ?? null,
      lastCompanyEventType: companyEvents?.eventType ?? null,
      lastCompanyEventSymbol: companyEvents?.symbol ?? null,
    },
    alerts: {
      alertLogFailed: alertFails,
      alertLogSent: alertSent,
      notificationFailed: notifFails,
      notificationSent: notifSent,
      notificationSuppressed: notifBlocked,
      duplicateSuppressedCounter: counters.duplicate_suppressed ?? 0,
    },
    jobs: {
      pendingOrFailed13f: pending13f,
      pendingJobCount: pending13f,
      failedEventCount: counters.company_event_fail ?? 0,
      alertDeliveryFailures:
        alertFails + notifFails + (counters.alert_delivery_fail ?? 0),
      duplicateSuppressionCount: counters.duplicate_suppressed ?? 0,
      lastFinancialNormalization:
        stamps.metrics_normalize_ok ??
        stamps.cron_metrics_ok ??
        checkpoints["cron:metrics-companyfacts"],
      last13fProcessing:
        stamps.cron_13f_ok ?? checkpoints["cron:institutional-13f"],
      lastSecIngest: stamps.sec_ingest_ok ?? {
        at: secHealth?.lastSuccessAt ?? null,
        meta: null,
      },
      lastEventProcessed:
        stamps.company_event_ok ??
        (companyEvents
          ? {
              at: companyEvents.createdAt.toISOString(),
              meta: {
                type: companyEvents.eventType,
                symbol: companyEvents.symbol,
              },
            }
          : null),
    },
  };
}
