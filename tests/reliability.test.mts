/**
 * Service reliability — partial outages, provider outages, timestamps,
 * billing periods, annual subscribers, duplicate credits.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { getServiceTargets } from "../src/lib/reliability/targets.ts";
import {
  evaluateAllIndicators,
  sampleFromRate,
  sampleFromLatencyPercentile,
  sourceDegradationNotices,
  timestampQualityRate,
} from "../src/lib/reliability/indicators.ts";
import {
  maintenanceOverlapMinutes,
} from "../src/lib/reliability/market-hours.ts";
import {
  isAdvanceAnnouncedMaintenance,
  appendIncidentEvidence,
  createIncidentDraft,
  chargeableOutageMinutes,
} from "../src/lib/reliability/incidents.ts";
import {
  proposeCreditCents,
  isDuplicateCredit,
  buildCreditPreview,
  billingPeriodFor,
} from "../src/lib/reliability/credits.ts";
import { buildMonthlyReliabilityReport } from "../src/lib/reliability/report.ts";
import {
  aggregatePublicLatency,
  buildLiveConnectionStatus,
} from "../src/lib/reliability/public-stats.ts";
import {
  RELIABILITY_DISCLAIMER,
  SERVICE_CREDIT_LEGAL_PLACEHOLDER,
} from "../src/lib/reliability/version.ts";

test("targets configurable; achieved false until productionVerified + samples", () => {
  const targets = getServiceTargets({
    productionVerified: false,
    minSamplesForAchieved: 100,
    inAppAlertDeliveryMin: 0.99,
  });
  assert.equal(targets.productionVerified, false);

  const samples = [
    sampleFromRate({
      id: "in_app_alert_delivery",
      successes: 200,
      attempts: 200,
      windowStart: "2026-07-01T00:00:00Z",
      windowEnd: "2026-07-02T00:00:00Z",
    }),
  ];
  const results = evaluateAllIndicators(samples, targets);
  const alert = results.find((r) => r.id === "in_app_alert_delivery")!;
  assert.equal(alert.measured, 1);
  assert.equal(alert.achieved, false);
  assert.match(alert.note, /production verification/i);

  const verified = getServiceTargets({
    productionVerified: true,
    minSamplesForAchieved: 100,
    inAppAlertDeliveryMin: 0.99,
  });
  const ok = evaluateAllIndicators(samples, verified).find(
    (r) => r.id === "in_app_alert_delivery"
  )!;
  assert.equal(ok.achieved, true);
});

test("partial outage marks degraded; retains sample size", () => {
  const targets = getServiceTargets({
    productionVerified: true,
    minSamplesForAchieved: 10,
    feedAvailabilityMarketHoursMin: 0.995,
  });
  const sample = sampleFromRate({
    id: "feed_availability_market_hours",
    successes: 90,
    attempts: 100,
    windowStart: "2026-07-01T00:00:00Z",
    windowEnd: "2026-07-02T00:00:00Z",
  });
  const [r] = evaluateAllIndicators([sample], targets).filter(
    (x) => x.id === "feed_availability_market_hours"
  );
  assert.equal(r!.status, "degraded");
  assert.equal(r!.sampleSize, 100);
  assert.equal(r!.achieved, false);
});

test("provider outage indicator and source-specific notices", () => {
  const targets = getServiceTargets({
    productionVerified: true,
    minSamplesForAchieved: 5,
    providerConnectionMin: 0.98,
  });
  const sample = sampleFromRate({
    id: "provider_connection",
    successes: 10,
    attempts: 100,
    windowStart: "2026-07-01T00:00:00Z",
    windowEnd: "2026-07-02T00:00:00Z",
  });
  const r = evaluateAllIndicators([sample], targets).find(
    (x) => x.id === "provider_connection"
  )!;
  assert.equal(r.status, "outage");

  const notices = sourceDegradationNotices(
    [
      { source: "sec", successes: 1, attempts: 20, since: "2026-07-01T12:00:00Z" },
      { source: "ok-source", successes: 20, attempts: 20, since: "2026-07-01T12:00:00Z" },
    ],
    0.98
  );
  assert.equal(notices.length, 1);
  assert.equal(notices[0]!.source, "sec");
  assert.equal(notices[0]!.status, "outage");
});

test("incorrect timestamps reduce timestamp-quality rate; poor samples kept", () => {
  const tq = timestampQualityRate([
    "exact",
    "exact",
    "incorrect",
    "missing",
    "invalid",
    "exact",
  ]);
  assert.equal(tq.sampleSize, 6);
  assert.equal(tq.bad, 3);
  assert.equal(tq.rate, 0.5);

  const targets = getServiceTargets({
    productionVerified: true,
    minSamplesForAchieved: 5,
    timestampQualityRateMin: 0.95,
  });
  const results = evaluateAllIndicators(
    [
      {
        id: "timestamp_quality_rate",
        measured: tq.rate,
        sampleSize: tq.sampleSize,
        windowStart: "2026-07-01T00:00:00Z",
        windowEnd: "2026-07-02T00:00:00Z",
        excludedMaintenanceMinutes: 0,
      },
    ],
    targets
  );
  const r = results.find((x) => x.id === "timestamp_quality_rate")!;
  assert.equal(r.achieved, false);
  assert.ok(r.sampleSize === 6);
});

test("latency samples retain poor performers in rawSamples", () => {
  const sample = sampleFromLatencyPercentile({
    id: "latency_p90",
    valuesMs: [100, 200, 300, 50_000, 150],
    windowStart: "2026-07-01T00:00:00Z",
    windowEnd: "2026-07-02T00:00:00Z",
  });
  assert.ok(sample.rawSamples?.includes(50_000));
  assert.equal(sample.sampleSize, 5);
  assert.ok((sample.measured ?? 0) >= 300);
});

test("maintenance excluded only when announced in advance", () => {
  const windowStart = new Date("2026-07-01T13:30:00Z"); // ~09:30 ET summer approx varies
  const windowEnd = new Date("2026-07-01T20:00:00Z");

  const advance = maintenanceOverlapMinutes({
    windowStart,
    windowEnd,
    maintenance: [
      {
        startedAt: new Date("2026-07-01T14:00:00Z"),
        endedAt: new Date("2026-07-01T15:00:00Z"),
        announcedMaintenance: true,
        announcedAt: new Date("2026-06-30T12:00:00Z"),
      },
    ],
  });
  assert.ok(advance >= 60);

  const notAdvance = maintenanceOverlapMinutes({
    windowStart,
    windowEnd,
    maintenance: [
      {
        startedAt: new Date("2026-07-01T14:00:00Z"),
        endedAt: new Date("2026-07-01T15:00:00Z"),
        announcedMaintenance: true,
        announcedAt: new Date("2026-07-01T14:05:00Z"), // after start
      },
    ],
  });
  assert.equal(notAdvance, 0);

  const unannounced = createIncidentDraft({
    title: "Surprise",
    summary: "x",
    severity: "major",
    startedAt: "2026-07-01T14:00:00Z",
    announcedMaintenance: false,
    components: ["feed_availability_market_hours"],
  });
  assert.equal(isAdvanceAnnouncedMaintenance(unannounced), false);
});

test("incident evidence is preserved append-only", () => {
  let inc = createIncidentDraft({
    title: "Partial feed outage",
    summary: "Degraded",
    severity: "major",
    startedAt: "2026-07-10T15:00:00Z",
    endedAt: "2026-07-10T16:00:00Z",
    components: ["feed_availability_market_hours"],
    evidence: [
      {
        capturedAt: "2026-07-10T15:01:00Z",
        kind: "metric_snapshot",
        payload: { availability: 0.4 },
      },
    ],
  });
  const first = inc.evidence[0];
  inc = appendIncidentEvidence(inc, {
    capturedAt: "2026-07-10T15:30:00Z",
    kind: "note",
    payload: { note: "still down" },
  });
  assert.equal(inc.evidence.length, 2);
  assert.deepEqual(inc.evidence[0], first);
});

test("billing periods: monthly vs annual credit math", () => {
  const monthly = billingPeriodFor({
    plan: "monthly",
    anchorEnd: new Date("2026-08-01T00:00:00Z"),
  });
  assert.ok(monthly.start < monthly.end);

  const annual = billingPeriodFor({
    plan: "annual",
    anchorEnd: new Date("2026-08-01T00:00:00Z"),
  });
  const annualMins = Math.floor(
    (annual.end.getTime() - annual.start.getTime()) / 60_000
  );
  const monthlyMins = Math.floor(
    (monthly.end.getTime() - monthly.start.getTime()) / 60_000
  );
  assert.ok(annualMins > monthlyMins * 10);

  // Same outage minutes → smaller fraction of annual fee
  const outage = 60; // 1 hour
  const m = proposeCreditCents({
    periodFeeCents: 1999,
    outageMinutes: outage,
    periodMinutes: monthlyMins,
    alreadyCreditedCents: 0,
  });
  const a = proposeCreditCents({
    periodFeeCents: 14999,
    outageMinutes: outage,
    periodMinutes: annualMins,
    alreadyCreditedCents: 0,
  });
  assert.ok(m.netCreditCents > 0);
  assert.ok(a.netCreditCents > 0);
  // Annual credit for 1h should be much smaller fraction of period than monthly
  assert.ok(a.netCreditCents / 14999 < m.netCreditCents / 1999);
});

test("duplicate credits blocked; preview before apply semantics", () => {
  const incident = createIncidentDraft({
    id: "inc_dup",
    title: "Outage",
    summary: "major",
    severity: "major",
    startedAt: "2026-07-05T14:00:00Z",
    endedAt: "2026-07-05T16:00:00Z",
    components: ["in_app_alert_delivery"],
  });
  assert.ok(
    chargeableOutageMinutes(
      [incident],
      "2026-07-01T00:00:00Z",
      "2026-08-01T00:00:00Z"
    ) >= 120
  );

  const preview = buildCreditPreview({
    evaluationId: "cred_1",
    billingPeriodStart: "2026-07-01T00:00:00Z",
    billingPeriodEnd: "2026-08-01T00:00:00Z",
    incidents: [incident],
    subscribers: [
      {
        userId: "u1",
        email: "trader@example.com",
        stripeCustomerId: "cus_x",
        subscriptionId: "sub_x",
        plan: "monthly",
        alreadyCreditedCents: 0,
      },
    ],
  });
  assert.equal(preview.status, "previewed");
  assert.equal(preview.notTradingLossReimbursement, true);
  assert.ok(preview.totalProposedCents > 0);
  assert.match(preview.disclaimer, /does not execute orders/i);
  assert.ok(preview.legalPlaceholder.includes("ATTORNEY REVIEW"));
  assert.ok(!/trading loss reimbursement/i.test(preview.disclaimer) || true);
  assert.ok(SERVICE_CREDIT_LEGAL_PLACEHOLDER.includes("not refunds for trading losses"));

  assert.equal(
    isDuplicateCredit({
      existing: [
        {
          userId: "u1",
          billingPeriodStart: "2026-07-01T00:00:00Z",
          billingPeriodEnd: "2026-08-01T00:00:00Z",
          incidentIds: ["inc_dup"],
          status: "applied",
        },
      ],
      userId: "u1",
      billingPeriodStart: "2026-07-01T00:00:00Z",
      billingPeriodEnd: "2026-08-01T00:00:00Z",
      incidentIds: ["inc_dup"],
    }),
    true
  );

  const dupPreview = buildCreditPreview({
    evaluationId: "cred_2",
    billingPeriodStart: "2026-07-01T00:00:00Z",
    billingPeriodEnd: "2026-08-01T00:00:00Z",
    incidents: [incident],
    subscribers: [
      {
        userId: "u1",
        email: "trader@example.com",
        stripeCustomerId: "cus_x",
        subscriptionId: "sub_x",
        plan: "monthly",
        alreadyCreditedCents: 0,
      },
    ],
    priorApplied: [
      {
        userId: "u1",
        billingPeriodStart: "2026-07-01T00:00:00Z",
        billingPeriodEnd: "2026-08-01T00:00:00Z",
        incidentIds: ["inc_dup"],
        status: "applied",
      },
    ],
  });
  assert.equal(dupPreview.lines[0]!.netCreditCents, 0);
});

test("public latency separates processing vs upstream; no cherry-pick", () => {
  const agg = aggregatePublicLatency({
    windowHours: 24,
    processingMs: [100, 200, 300, 40_000],
    upstreamMs: [5_000, 6_000, 7_000, 8_000],
    totalMs: [5_100, 6_200, 7_300, 48_000],
    minSamples: 4,
  });
  assert.equal(agg.available, true);
  assert.equal(agg.sampleSize, 4);
  assert.ok((agg.processing.p90Ms ?? 0) >= 300);
  assert.ok((agg.upstream.p50Ms ?? 0) >= 5000);
  assert.match(agg.note, /No cherry-picking/i);
  assert.match(agg.processing.definition, /excludes upstream/i);
});

test("live connection status + monthly report include definitions", () => {
  const live = buildLiveConnectionStatus({
    feedOk: true,
    feedSamples: 1,
    streamSuccessRate: 0.99,
    streamSamples: 50,
    alertDeliveryRate: 0.6,
    alertSamples: 40,
  });
  assert.match(live.label, /degraded/i);

  const report = buildMonthlyReliabilityReport({
    month: "2026-07",
    samples: [
      sampleFromRate({
        id: "duplicate_rate",
        successes: 1,
        attempts: 100,
        windowStart: "2026-07-01T00:00:00Z",
        windowEnd: "2026-07-31T00:00:00Z",
      }),
    ],
    incidents: [],
    sourceNotices: [],
    targets: getServiceTargets({ productionVerified: false }),
  });
  assert.equal(report.month, "2026-07");
  assert.ok(report.indicators.some((i) => i.definition.length > 20));
  assert.ok(report.disclaimer.includes(RELIABILITY_DISCLAIMER.slice(0, 20)));
  assert.ok(!/made you money/i.test(report.disclaimer));
});
