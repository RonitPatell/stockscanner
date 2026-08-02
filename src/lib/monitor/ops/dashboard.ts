/**
 * Assemble Monitor Operations dashboard (admin-only consumers).
 */

import {
  MONITOR_OPS_VERSION,
  type MonitorOpsControls,
  type MonitorOpsDashboard,
  type MonitorOpsQualityEvent,
} from "@/domain/monitor/ops";
import { MONITOR_DELIVERY_VERSION } from "@/domain/monitor/delivery";
import { MONITOR_MOMENTUM_VERSION } from "@/domain/monitor/momentum/version";
import { MONITOR_ATTENTION_VERSION } from "@/domain/monitor/attention/version";
import { MONITOR_MOMENTUM_STATE_VERSION } from "@/domain/monitor/momentum-state/version";
import { MONITOR_MARKET_STATE_VERSION } from "@/domain/monitor/market-state/version";
import { MONITOR_CALIBRATION_VERSION } from "@/domain/monitor/calibration/version";
import { computeCalibrationReport } from "@/domain/monitor/calibration";
import { getMonitorDeliveryHub } from "@/lib/monitor/delivery/server-hub";
import { listReplaySessions, getReplaySession } from "@/lib/monitor/replay-registry";
import { getMonitorActiveClients } from "./active-clients";
import { listMonitorOpsAudit } from "./audit";
import { loadMonitorOpsControls } from "./controls-store";
import { listProviderConnections } from "./providers";
import { listMonitorOpsQuality } from "./quality-store";
import {
  MONITOR_EXPANSION_GATE_LABELS,
  MONITOR_ROLLOUT_STAGE_META,
  MONITOR_ROLLOUT_STAGES,
  allExpansionGatesClear,
  missingExpansionGates,
} from "@/domain/monitor/rollout";
import {
  getMonitorBuildDiagnostics,
  listMonitorBetaFeedback,
  listMonitorErrorSessions,
  loadExpansionGates,
  readSubsystemEnvFlags,
  resolveActiveRolloutStage,
} from "@/lib/monitor/rollout";

const CAL_DISCLAIMER =
  "Descriptive calibration only — sample distributions. Not a trading forecast.";

function ofKind(events: MonitorOpsQualityEvent[], kind: MonitorOpsQualityEvent["kind"]) {
  return events.filter((e) => e.kind === kind);
}

export async function buildMonitorOpsDashboard(): Promise<MonitorOpsDashboard> {
  const controls = await loadMonitorOpsControls();
  const hub = getMonitorDeliveryHub();
  const metrics = hub.metrics();
  const snap = hub.latestSnapshot();
  const quality = await listMonitorOpsQuality(250);
  const activeClients = await getMonitorActiveClients();
  const audit = await listMonitorOpsAudit(30);
  const sessions = await listReplaySessions();
  const expansionGates = await loadExpansionGates();
  const build = getMonitorBuildDiagnostics();
  const stage = resolveActiveRolloutStage(controls.featureFlagCohort);
  const subsystemFlags = readSubsystemEnvFlags(true);
  const betaFeedback = await listMonitorBetaFeedback(20);
  const errorSessions = await listMonitorErrorSessions(20);

  const rejected = ofKind(quality, "rejected_event").length;
  const gaps = ofKind(quality, "sequence_gap").length;
  const missingSeq = ofKind(quality, "missing_sequence").length;

  const stateDist: Record<string, number> = {};
  for (const s of snap.symbols) {
    const st = s.momentumState ?? "UNKNOWN";
    stateDist[st] = (stateDist[st] ?? 0) + 1;
  }

  const leaders = [...snap.symbols]
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
    .slice(0, 8)
    .map((s) => ({
      symbol: s.symbol,
      rank: s.rank,
      attentionPriority: s.attentionPriority,
      momentumState: s.momentumState,
      intensity: s.momentumIntensity,
    }));

  const now = Date.now();
  const staleQuotes = snap.symbols
    .filter((s) => s.stale || s.dataAvailability === "stale")
    .map((s) => ({
      symbol: s.symbol,
      asOfMs: s.asOfMs,
      ageMs: Math.max(0, now - s.asOfMs),
    }));

  const calcVersions = [
    { id: MONITOR_MOMENTUM_VERSION, label: "Momentum" },
    { id: MONITOR_ATTENTION_VERSION, label: "Attention" },
    { id: MONITOR_MOMENTUM_STATE_VERSION, label: "Momentum state" },
    { id: MONITOR_MARKET_STATE_VERSION, label: "Market state" },
    { id: MONITOR_DELIVERY_VERSION, label: "Delivery" },
    { id: MONITOR_CALIBRATION_VERSION, label: "Calibration" },
  ].map((v) => ({
    ...v,
    enabled: !controls.disabledCalculationVersions.includes(v.id),
  }));

  let outcomeDistributions: MonitorOpsDashboard["calibration"]["outcomeDistributions"] =
    null;
  const defaultSessionId =
    sessions.find((s) => s.id === "fixture-monitor-replay-v1")?.id ??
    sessions[0]?.id;
  if (defaultSessionId) {
    const session = await getReplaySession(defaultSessionId);
    if (session) {
      const report = computeCalibrationReport(session);
      outcomeDistributions = {
        sampleFrames: report.sampleFrames,
        intensityByState: report.intensityByState.map((r) => ({
          state: r.state,
          n: r.intensity.n,
          mean: r.intensity.mean,
        })),
        disclaimer: report.disclaimer || CAL_DISCLAIMER,
      };
    }
  }

  const notes: string[] = [];
  if (controls.monitorGloballyDisabled) {
    notes.push("Monitor is globally disabled via ops control.");
  }
  if (controls.leaderSelectionFrozen) {
    notes.push(
      `Leader selection frozen${
        controls.frozenLeaderSymbol ? ` on ${controls.frozenLeaderSymbol}` : ""
      }.`
    );
  }
  notes.push(
    "Provider secrets are never exposed. Reprocess creates derived sessions only."
  );

  return {
    version: MONITOR_OPS_VERSION,
    generatedAtMs: now,
    controls,
    live: {
      providers: listProviderConnections(controls),
      processingLagMsAvg: Math.round(metrics.lagMsAvg),
      processingLagMsMax: metrics.lagMsMax,
      inboundQueueDepth: metrics.inboundQueueDepth,
      outboundQueueDepth: metrics.outboundQueueDepth,
      activeSymbols: snap.symbols.length,
      trackedSymbols: metrics.trackedSymbols,
      activeClients,
      clientAcks: metrics.clientAcks,
      dropped: {
        source: metrics.eventsDroppedSource,
        lag: metrics.eventsDroppedLag,
        backpressure: metrics.eventsDroppedBackpressure,
        obsoleteVisual: metrics.eventsDroppedObsoleteVisual,
        rejected,
      },
      sequence: {
        latest: snap.sequence,
        gapsObserved: gaps,
        missingSequenceEvents: missingSeq,
      },
      streamAcknowledgement: {
        ackCount: metrics.clientAcks,
        lastPublishMs: metrics.lastPublishMs,
        health: metrics.health,
        circuits: {
          source: metrics.circuitSource,
          processing: metrics.circuitProcessing,
        },
      },
    },
    momentumQuality: {
      currentLeaders: leaders,
      leaderTransitions: ofKind(quality, "leader_transition").slice(0, 40).map((e) => ({
        atMs: e.atMs,
        from: typeof e.meta?.from === "string" ? e.meta.from : null,
        to: e.symbol ?? (typeof e.meta?.to === "string" ? String(e.meta.to) : null),
        reason: e.note,
      })),
      momentumStateDistribution: stateDist,
      stateFlapping: ofKind(quality, "state_flap").slice(0, 30).map((e) => ({
        symbol: e.symbol ?? "?",
        transitionsRecent:
          typeof e.meta?.transitions === "number" ? e.meta.transitions : 0,
        windowMs: typeof e.meta?.windowMs === "number" ? e.meta.windowMs : 60_000,
      })),
      lowConfidenceScores: ofKind(quality, "low_confidence").slice(0, 30).map((e) => ({
        symbol: e.symbol ?? "?",
        confidence: String(e.meta?.confidence ?? "low"),
        note: e.note,
      })),
      onePrintAnomalies: ofKind(quality, "one_print").slice(0, 30).map((e) => ({
        symbol: e.symbol ?? "?",
        atMs: e.atMs,
        note: e.note,
      })),
      calculationVersions: calcVersions,
    },
    dataQuality: {
      staleQuotes,
      crossedMarkets: ofKind(quality, "crossed_market").slice(0, 40).map((e) => ({
        symbol: e.symbol ?? "?",
        note: e.note,
        atMs: e.atMs,
      })),
      invalidPrices: ofKind(quality, "invalid_price").slice(0, 40).map((e) => ({
        symbol: e.symbol ?? "?",
        note: e.note,
        atMs: e.atMs,
      })),
      missingSequenceNumbers: missingSeq,
      ambiguousTickerResolution: ofKind(quality, "ambiguous_ticker")
        .slice(0, 30)
        .map((e) => ({
          raw: String(e.meta?.raw ?? e.symbol ?? "?"),
          candidates: String(e.meta?.candidates ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          atMs: e.atMs,
        })),
      providerDisagreement: ofKind(quality, "provider_disagreement")
        .slice(0, 30)
        .map((e) => ({
          symbol: e.symbol ?? "?",
          field: String(e.meta?.field ?? "unknown"),
          providers: String(e.meta?.providers ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          atMs: e.atMs,
        })),
      haltSourceDisagreement: ofKind(quality, "halt_source_disagreement")
        .slice(0, 30)
        .map((e) => ({
          symbol: e.symbol ?? "?",
          sources: String(e.meta?.sources ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          atMs: e.atMs,
        })),
    },
    calibration: {
      replaySessions: sessions.slice(0, 40).map((s) => ({
        id: s.id,
        frameCount: s.frameCount,
        fromMs: s.fromMs,
        toMs: s.toMs,
      })),
      candidateEngineComparison: {
        available: true,
        note: "Shadow compare via POST /api/admin/monitor-calibration — user-facing output unchanged.",
        lastShadow: null,
      },
      configurationVersions: [
        { id: "ops", value: MONITOR_OPS_VERSION },
        { id: "delivery", value: MONITOR_DELIVERY_VERSION },
        { id: "momentum", value: MONITOR_MOMENTUM_VERSION },
        { id: "attention", value: MONITOR_ATTENTION_VERSION },
        {
          id: "featureFlagCohort",
          value: controls.featureFlagCohort ?? "(default)",
        },
      ],
      outcomeDistributions,
    },
    recentAudit: audit,
    notes,
    rollout: {
      stage,
      stageLabel: stage ? MONITOR_ROLLOUT_STAGE_META[stage].label : null,
      stages: MONITOR_ROLLOUT_STAGES.map((id) => ({
        id,
        label: MONITOR_ROLLOUT_STAGE_META[id].label,
        description: MONITOR_ROLLOUT_STAGE_META[id].description,
      })),
      expansionGates: Object.fromEntries(
        (
          Object.keys(MONITOR_EXPANSION_GATE_LABELS) as Array<
            keyof typeof MONITOR_EXPANSION_GATE_LABELS
          >
        ).map((id) => [
          id,
          {
            label: MONITOR_EXPANSION_GATE_LABELS[id],
            clear: expansionGates[id] === true,
          },
        ])
      ),
      gatesAllClear: allExpansionGatesClear(expansionGates),
      gatesMissing: missingExpansionGates(expansionGates),
      subsystemFlags,
      build,
      betaFeedbackCount: betaFeedback.length,
      errorSessionCount: errorSessions.length,
      recentErrorSessions: errorSessions.slice(0, 10),
      recentBetaFeedback: betaFeedback.slice(0, 10).map((f) => ({
        id: f.id,
        atMs: f.atMs,
        category: f.category,
        message: f.message.slice(0, 200),
        stage: f.stage,
      })),
      metricsDisclaimer:
        "Rollout and beta observations are diagnostic only — not achieved service guarantees, SLAs, or profitability claims.",
    },
  };
}

export type { MonitorOpsControls };
