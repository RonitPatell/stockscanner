"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { MONITOR_OPS_CONFIRM } from "@/domain/monitor/ops";

type Dash = {
  version: string;
  generatedAtMs: number;
  controls: {
    monitorGloballyDisabled: boolean;
    disabledProviders: string[];
    disabledCalculationVersions: string[];
    leaderSelectionFrozen: boolean;
    frozenLeaderSymbol: string | null;
    featureFlagCohort: string | null;
    quarantinedTickers: string[];
  };
  live: {
    providers: Array<{
      id: string;
      label: string;
      configured: boolean;
      enabled: boolean;
      state: string;
      lastError: string | null;
      subscribedSymbolCount: number | null;
    }>;
    processingLagMsAvg: number;
    processingLagMsMax: number;
    inboundQueueDepth: number;
    outboundQueueDepth: number;
    activeSymbols: number;
    trackedSymbols: number;
    activeClients: number;
    clientAcks: number;
    dropped: {
      source: number;
      lag: number;
      backpressure: number;
      obsoleteVisual: number;
      rejected: number;
    };
    sequence: {
      latest: number;
      gapsObserved: number;
      missingSequenceEvents: number;
    };
    streamAcknowledgement: {
      ackCount: number;
      lastPublishMs: number;
      health: string;
      circuits: { source: string; processing: string };
    };
  };
  momentumQuality: {
    currentLeaders: Array<{
      symbol: string;
      rank: number | null;
      attentionPriority: number | null;
      momentumState: string | null;
      intensity: number | null;
    }>;
    leaderTransitions: Array<{
      atMs: number;
      from: string | null;
      to: string | null;
      reason: string;
    }>;
    momentumStateDistribution: Record<string, number>;
    stateFlapping: Array<{
      symbol: string;
      transitionsRecent: number;
      windowMs: number;
    }>;
    lowConfidenceScores: Array<{
      symbol: string;
      confidence: string;
      note: string;
    }>;
    onePrintAnomalies: Array<{ symbol: string; atMs: number; note: string }>;
    calculationVersions: Array<{ id: string; label: string; enabled: boolean }>;
  };
  dataQuality: {
    staleQuotes: Array<{ symbol: string; asOfMs: number; ageMs: number }>;
    crossedMarkets: Array<{ symbol: string; note: string; atMs: number }>;
    invalidPrices: Array<{ symbol: string; note: string; atMs: number }>;
    missingSequenceNumbers: number;
    ambiguousTickerResolution: Array<{
      raw: string;
      candidates: string[];
      atMs: number;
    }>;
    providerDisagreement: Array<{
      symbol: string;
      field: string;
      providers: string[];
      atMs: number;
    }>;
    haltSourceDisagreement: Array<{
      symbol: string;
      sources: string[];
      atMs: number;
    }>;
  };
  calibration: {
    replaySessions: Array<{
      id: string;
      frameCount: number;
      fromMs: number;
      toMs: number;
    }>;
    candidateEngineComparison: {
      available: boolean;
      note: string;
      lastShadow: null | {
        productionEngine: string;
        candidateEngine: string;
        pairs: number;
        stateAgreementRate: number | null;
        userOutputUnchanged: true;
      };
    };
    configurationVersions: Array<{ id: string; value: string }>;
    outcomeDistributions: {
      sampleFrames: number;
      intensityByState: Array<{ state: string; n: number; mean: number }>;
      disclaimer: string;
    } | null;
  };
  recentAudit: Array<{
    id: string;
    actorUserId: string;
    action: string;
    confirmToken: string | null;
    detail: Record<string, unknown>;
    createdAt: string;
  }>;
  notes: string[];
  rollout?: {
    stage: string | null;
    stageLabel: string | null;
    stages: Array<{ id: string; label: string; description: string }>;
    expansionGates: Record<string, { label: string; clear: boolean }>;
    gatesAllClear: boolean;
    gatesMissing: string[];
    subsystemFlags: Record<string, boolean>;
    build: {
      buildId: string;
      gitSha: string | null;
      engines: Array<{ id: string; version: string }>;
      disclaimer: string;
    };
    metricsDisclaimer: string;
    recentErrorSessions: Array<{
      id: string;
      atMs: number;
      message: string;
      path: string | null;
    }>;
    recentBetaFeedback: Array<{
      id: string;
      atMs: number;
      category: string;
      message: string;
    }>;
  };
};

function Card({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded border border-zinc-800 bg-zinc-950/60 p-4 space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-zinc-800/80 bg-zinc-900/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-sm text-zinc-100">{value}</div>
    </div>
  );
}

function Empty({ text = "None observed" }: { text?: string }) {
  return <p className="text-xs text-zinc-500">{text}</p>;
}

export function AdminMonitorOpsClient() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [message, setMessage] = useState("");
  const [providerId, setProviderId] = useState("finnhub");
  const [calcVersion, setCalcVersion] = useState("");
  const [freezeSymbol, setFreezeSymbol] = useState("");
  const [cohortId, setCohortId] = useState("monitor-v1-rollback");
  const [quarantineSymbol, setQuarantineSymbol] = useState("");
  const [sessionId, setSessionId] = useState("fixture-monitor-replay-v1");
  const [fromMs, setFromMs] = useState("");
  const [toMs, setToMs] = useState("");

  const load = useCallback(() => {
    void fetch("/api/admin/monitor-ops")
      .then(async (r) => {
        if (!r.ok) {
          throw new Error(
            (await r.json().catch(() => ({}))).error ?? "Load failed"
          );
        }
        return r.json();
      })
      .then((d: Dash) => {
        setDash(d);
        setCalcVersion((prev) =>
          prev || d.momentumQuality.calculationVersions[0]?.id || ""
        );
        setSessionId((prev) =>
          prev === "fixture-monitor-replay-v1" && d.calibration.replaySessions[0]
            ? d.calibration.replaySessions[0]!.id
            : prev
        );
      })
      .catch((e: Error) => setMessage(e.message || "Failed to load"));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  const mutate = async (
    action: keyof typeof MONITOR_OPS_CONFIRM,
    body: Record<string, unknown>,
    browserConfirm: string
  ) => {
    if (!window.confirm(browserConfirm)) return;
    const confirm = MONITOR_OPS_CONFIRM[action];
    const res = await fetch("/api/admin/monitor-ops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, confirm, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error ?? "Action failed");
      return;
    }
    setMessage(`OK: ${action}`);
    load();
  };

  if (!dash) {
    return (
      <p className="text-sm text-zinc-400">{message || "Loading operations…"}</p>
    );
  }

  const { live, momentumQuality, dataQuality, calibration, controls } = dash;

  return (
    <div className="space-y-6 text-sm text-zinc-300" data-testid="monitor-ops-dashboard">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={load}>
          Refresh
        </Button>
        <span className="text-xs text-zinc-500">
          {dash.version} · {new Date(dash.generatedAtMs).toLocaleString()}
        </span>
        {message ? (
          <span className="text-xs text-amber-300/90" role="status">
            {message}
          </span>
        ) : null}
      </div>

      {dash.notes.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-xs text-zinc-500">
          {dash.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}

      <Card title="Live operations">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          <Metric label="Processing lag avg" value={`${live.processingLagMsAvg} ms`} />
          <Metric label="Processing lag max" value={`${live.processingLagMsMax} ms`} />
          <Metric label="Inbound queue" value={live.inboundQueueDepth} />
          <Metric label="Outbound queue" value={live.outboundQueueDepth} />
          <Metric label="Active symbols" value={live.activeSymbols} />
          <Metric label="Tracked symbols" value={live.trackedSymbols} />
          <Metric label="Active clients" value={live.activeClients} />
          <Metric label="Stream acks" value={live.streamAcknowledgement.ackCount} />
          <Metric label="Sequence" value={live.sequence.latest} />
          <Metric label="Sequence gaps" value={live.sequence.gapsObserved} />
          <Metric
            label="Missing sequences"
            value={live.sequence.missingSequenceEvents}
          />
          <Metric label="Health" value={live.streamAcknowledgement.health} />
          <Metric
            label="Source circuit"
            value={live.streamAcknowledgement.circuits.source}
          />
          <Metric
            label="Processing circuit"
            value={live.streamAcknowledgement.circuits.processing}
          />
          <Metric
            label="Dropped (source/lag/bp/visual/rej)"
            value={`${live.dropped.source}/${live.dropped.lag}/${live.dropped.backpressure}/${live.dropped.obsoleteVisual}/${live.dropped.rejected}`}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-zinc-500">
              <tr>
                <th className="py-1 pr-2">Provider</th>
                <th className="py-1 pr-2">Configured</th>
                <th className="py-1 pr-2">Enabled</th>
                <th className="py-1 pr-2">State</th>
              </tr>
            </thead>
            <tbody>
              {live.providers.map((p) => (
                <tr key={p.id} className="border-t border-zinc-800/80">
                  <td className="py-1.5 pr-2 font-mono">{p.label}</td>
                  <td className="py-1.5 pr-2">{p.configured ? "yes" : "no"}</td>
                  <td className="py-1.5 pr-2">{p.enabled ? "yes" : "no"}</td>
                  <td className="py-1.5 pr-2">{p.state}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Momentum quality">
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-1 text-xs text-zinc-500">Current leaders</h3>
            {momentumQuality.currentLeaders.length === 0 ? (
              <Empty />
            ) : (
              <ul className="space-y-1 font-mono text-xs">
                {momentumQuality.currentLeaders.map((l) => (
                  <li key={l.symbol}>
                    #{l.rank ?? "—"} {l.symbol} · {l.momentumState ?? "—"} · pri{" "}
                    {l.attentionPriority ?? "—"}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-1 text-xs text-zinc-500">State distribution</h3>
            {Object.keys(momentumQuality.momentumStateDistribution).length ===
            0 ? (
              <Empty />
            ) : (
              <ul className="space-y-1 font-mono text-xs">
                {Object.entries(momentumQuality.momentumStateDistribution).map(
                  ([k, v]) => (
                    <li key={k}>
                      {k}: {v}
                    </li>
                  )
                )}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-1 text-xs text-zinc-500">Leader transitions</h3>
            {momentumQuality.leaderTransitions.length === 0 ? (
              <Empty text="No transitions recorded in ops quality ring" />
            ) : (
              <ul className="max-h-40 space-y-1 overflow-auto font-mono text-xs">
                {momentumQuality.leaderTransitions.map((t, i) => (
                  <li key={`${t.atMs}-${i}`}>
                    {t.from ?? "—"} → {t.to ?? "—"} · {t.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-1 text-xs text-zinc-500">Calculation versions</h3>
            <ul className="space-y-1 font-mono text-xs">
              {momentumQuality.calculationVersions.map((v) => (
                <li key={v.id}>
                  {v.label}: {v.id}{" "}
                  <span className={v.enabled ? "text-emerald-400/80" : "text-amber-300"}>
                    {v.enabled ? "enabled" : "disabled"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <h3 className="mb-1 text-xs text-zinc-500">State flapping</h3>
            {momentumQuality.stateFlapping.length === 0 ? (
              <Empty />
            ) : (
              <ul className="font-mono text-xs">
                {momentumQuality.stateFlapping.map((f) => (
                  <li key={f.symbol}>
                    {f.symbol}: {f.transitionsRecent} / {f.windowMs}ms
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-1 text-xs text-zinc-500">Low-confidence</h3>
            {momentumQuality.lowConfidenceScores.length === 0 ? (
              <Empty />
            ) : (
              <ul className="font-mono text-xs">
                {momentumQuality.lowConfidenceScores.map((r) => (
                  <li key={`${r.symbol}-${r.note}`}>
                    {r.symbol}: {r.confidence}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-1 text-xs text-zinc-500">One-print anomalies</h3>
            {momentumQuality.onePrintAnomalies.length === 0 ? (
              <Empty />
            ) : (
              <ul className="font-mono text-xs">
                {momentumQuality.onePrintAnomalies.map((r) => (
                  <li key={`${r.symbol}-${r.atMs}`}>{r.symbol}: {r.note}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Card>

      <Card title="Data quality">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 mb-3">
          <Metric label="Stale quotes" value={dataQuality.staleQuotes.length} />
          <Metric label="Crossed markets" value={dataQuality.crossedMarkets.length} />
          <Metric label="Invalid prices" value={dataQuality.invalidPrices.length} />
          <Metric
            label="Missing sequence #"
            value={dataQuality.missingSequenceNumbers}
          />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <div>
            <h3 className="mb-1 text-xs text-zinc-500">Stale quotes</h3>
            {dataQuality.staleQuotes.length === 0 ? (
              <Empty />
            ) : (
              <ul className="max-h-32 overflow-auto font-mono text-xs">
                {dataQuality.staleQuotes.map((s) => (
                  <li key={s.symbol}>
                    {s.symbol}: age {s.ageMs}ms
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-1 text-xs text-zinc-500">Provider disagreement</h3>
            {dataQuality.providerDisagreement.length === 0 ? (
              <Empty />
            ) : (
              <ul className="font-mono text-xs">
                {dataQuality.providerDisagreement.map((d, i) => (
                  <li key={i}>
                    {d.symbol} {d.field}: {d.providers.join(" vs ")}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-1 text-xs text-zinc-500">Ambiguous ticker resolution</h3>
            {dataQuality.ambiguousTickerResolution.length === 0 ? (
              <Empty />
            ) : (
              <ul className="font-mono text-xs">
                {dataQuality.ambiguousTickerResolution.map((a, i) => (
                  <li key={i}>
                    {a.raw} → {a.candidates.join(", ") || "?"}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-1 text-xs text-zinc-500">Halt-source disagreement</h3>
            {dataQuality.haltSourceDisagreement.length === 0 ? (
              <Empty />
            ) : (
              <ul className="font-mono text-xs">
                {dataQuality.haltSourceDisagreement.map((h, i) => (
                  <li key={i}>
                    {h.symbol}: {h.sources.join(" vs ")}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Card>

      <Card title="Calibration">
        <p className="text-xs text-zinc-500">
          {calibration.candidateEngineComparison.note}
        </p>
        <div className="grid gap-3 lg:grid-cols-2">
          <div>
            <h3 className="mb-1 text-xs text-zinc-500">Replay sessions</h3>
            {calibration.replaySessions.length === 0 ? (
              <Empty />
            ) : (
              <ul className="max-h-40 space-y-1 overflow-auto font-mono text-xs">
                {calibration.replaySessions.map((s) => (
                  <li key={s.id}>
                    {s.id} · {s.frameCount} frames
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-1 text-xs text-zinc-500">Configuration versions</h3>
            <ul className="font-mono text-xs space-y-1">
              {calibration.configurationVersions.map((c) => (
                <li key={c.id}>
                  {c.id}: {c.value}
                </li>
              ))}
            </ul>
          </div>
        </div>
        {calibration.outcomeDistributions ? (
          <div>
            <h3 className="mb-1 text-xs text-zinc-500">
              Outcome distributions (n={calibration.outcomeDistributions.sampleFrames})
            </h3>
            <ul className="font-mono text-xs space-y-1">
              {calibration.outcomeDistributions.intensityByState.map((r) => (
                <li key={r.state}>
                  {r.state}: mean intensity {r.mean.toFixed(3)} (n={r.n})
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-zinc-500">
              {calibration.outcomeDistributions.disclaimer}
            </p>
          </div>
        ) : (
          <Empty text="No calibration sample session loaded" />
        )}
      </Card>

      <Card title="Controls">
        <p className="text-xs text-zinc-500">
          Mutations require browser confirmation and a server-side confirm token.
          Sensitive actions are audit-logged. Rate-limited.
        </p>
        <div className="rounded border border-zinc-800 bg-zinc-900/30 p-3 font-mono text-xs space-y-1">
          <div>
            Global:{" "}
            {controls.monitorGloballyDisabled ? (
              <span className="text-amber-300">DISABLED</span>
            ) : (
              <span className="text-emerald-400/80">enabled</span>
            )}
          </div>
          <div>
            Leader freeze:{" "}
            {controls.leaderSelectionFrozen
              ? `frozen ${controls.frozenLeaderSymbol ?? "(current)"}`
              : "off"}
          </div>
          <div>Cohort: {controls.featureFlagCohort ?? "(default)"}</div>
          <div>
            Quarantine:{" "}
            {controls.quarantinedTickers.length
              ? controls.quarantinedTickers.join(", ")
              : "none"}
          </div>
          <div>
            Disabled providers:{" "}
            {controls.disabledProviders.length
              ? controls.disabledProviders.join(", ")
              : "none"}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-xs text-zinc-500">
              Provider id
              <input
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 font-mono text-xs"
                value={providerId}
                onChange={(e) => setProviderId(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  mutate(
                    "disable_provider",
                    { providerId },
                    `Disable provider "${providerId}"? Confirm token will be sent.`
                  )
                }
              >
                Disable provider
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  mutate(
                    "enable_provider",
                    { providerId },
                    `Re-enable provider "${providerId}"?`
                  )
                }
              >
                Enable provider
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs text-zinc-500">
              Calculation version
              <input
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 font-mono text-xs"
                value={calcVersion}
                onChange={(e) => setCalcVersion(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  mutate(
                    "disable_calculation_version",
                    { calculationVersion: calcVersion },
                    `Disable calculation version "${calcVersion}"?`
                  )
                }
              >
                Disable calc version
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  mutate(
                    "enable_calculation_version",
                    { calculationVersion: calcVersion },
                    `Enable calculation version "${calcVersion}"?`
                  )
                }
              >
                Enable calc version
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs text-zinc-500">
              Freeze leader symbol (optional)
              <input
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 font-mono text-xs"
                value={freezeSymbol}
                onChange={(e) => setFreezeSymbol(e.target.value)}
                placeholder="AAAA"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  mutate(
                    "freeze_leader_selection",
                    { freezeSymbol: freezeSymbol || undefined },
                    "Freeze automatic leader selection?"
                  )
                }
              >
                Freeze leader
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  mutate(
                    "unfreeze_leader_selection",
                    {},
                    "Unfreeze leader selection?"
                  )
                }
              >
                Unfreeze leader
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() =>
                  mutate(
                    "disable_monitor_global",
                    {},
                    "Disable Monitor globally for all users?"
                  )
                }
              >
                Disable Monitor globally
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  mutate(
                    "enable_monitor_global",
                    {},
                    "Re-enable Monitor globally?"
                  )
                }
              >
                Enable Monitor
              </Button>
            </div>
            <label className="block text-xs text-zinc-500">
              Feature-flag cohort rollback
              <input
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 font-mono text-xs"
                value={cohortId}
                onChange={(e) => setCohortId(e.target.value)}
              />
            </label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                mutate(
                  "rollback_feature_flag_cohort",
                  { cohortId },
                  `Roll back feature-flag cohort to "${cohortId}"?`
                )
              }
            >
              Roll back cohort
            </Button>
          </div>

          <div className="space-y-2">
            <label className="block text-xs text-zinc-500">
              Quarantine ticker
              <input
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 font-mono text-xs"
                value={quarantineSymbol}
                onChange={(e) => setQuarantineSymbol(e.target.value)}
                placeholder="TICK"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  mutate(
                    "quarantine_ticker",
                    { symbol: quarantineSymbol },
                    `Quarantine ${quarantineSymbol}?`
                  )
                }
              >
                Quarantine
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  mutate(
                    "release_ticker",
                    { symbol: quarantineSymbol },
                    `Release ${quarantineSymbol} from quarantine?`
                  )
                }
              >
                Release
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs text-zinc-500">
              Reprocess bounded replay window (derived session only)
            </h3>
            <label className="block text-xs text-zinc-500">
              Session id
              <input
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 font-mono text-xs"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-zinc-500">
                fromMs
                <input
                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 font-mono text-xs"
                  value={fromMs}
                  onChange={(e) => setFromMs(e.target.value)}
                />
              </label>
              <label className="block text-xs text-zinc-500">
                toMs
                <input
                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 font-mono text-xs"
                  value={toMs}
                  onChange={(e) => setToMs(e.target.value)}
                />
              </label>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                mutate(
                  "reprocess_replay_window",
                  {
                    sessionId,
                    fromMs: Number(fromMs),
                    toMs: Number(toMs),
                  },
                  "Create a derived reprocess session? Source frames will NOT be modified."
                )
              }
            >
              Reprocess window
            </Button>
          </div>
        </div>
      </Card>

      {dash.rollout ? (
        <Card title="Staged rollout">
          <p className="text-xs text-zinc-500">{dash.rollout.metricsDisclaimer}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Metric
              label="Active stage"
              value={dash.rollout.stageLabel ?? dash.rollout.stage ?? "(env only)"}
            />
            <Metric label="Build id" value={dash.rollout.build.buildId} />
            <Metric
              label="Git SHA"
              value={dash.rollout.build.gitSha?.slice(0, 12) ?? "—"}
            />
            <Metric
              label="Gates clear"
              value={dash.rollout.gatesAllClear ? "yes" : "no"}
            />
          </div>
          <div>
            <h3 className="mb-1 text-xs text-zinc-500">Engine versions</h3>
            <ul className="font-mono text-xs space-y-1">
              {dash.rollout.build.engines.map((e) => (
                <li key={e.id}>
                  {e.id}: {e.version}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[10px] text-zinc-600">
              {dash.rollout.build.disclaimer}
            </p>
          </div>
          <div>
            <h3 className="mb-1 text-xs text-zinc-500">Subsystem flags</h3>
            <ul className="font-mono text-xs space-y-1">
              {Object.entries(dash.rollout.subsystemFlags).map(([k, v]) => (
                <li key={k}>
                  {k}: {v ? "on" : "off"}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-1 text-xs text-zinc-500">
              Expansion gates (required before advance)
            </h3>
            <ul className="space-y-1 text-xs">
              {Object.entries(dash.rollout.expansionGates).map(([id, g]) => (
                <li key={id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={g.clear}
                    onChange={(e) => {
                      const next = {
                        ...Object.fromEntries(
                          Object.entries(dash.rollout!.expansionGates).map(
                            ([k, v]) => [k, v.clear]
                          )
                        ),
                        [id]: e.target.checked,
                      };
                      void mutate(
                        "attest_expansion_gates",
                        { gates: next },
                        `Attest expansion gate "${g.label}"?`
                      );
                    }}
                  />
                  <span className={g.clear ? "text-emerald-400/80" : "text-zinc-400"}>
                    {g.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 font-mono text-xs"
              value={dash.rollout.stage ?? ""}
              onChange={(e) => setCohortId(e.target.value)}
            >
              <option value="">(select stage)</option>
              {dash.rollout.stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                mutate(
                  "set_rollout_stage",
                  {
                    cohortId: cohortId || dash.rollout?.stage,
                    advance: true,
                    requireGates: true,
                  },
                  "Set rollout stage? If advancing, all expansion gates must be clear."
                )
              }
            >
              Set stage (gated)
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() =>
                mutate(
                  "one_click_rollback",
                  {},
                  "ONE-CLICK ROLLBACK: disable Monitor globally and set rollback cohort? Feed/legacy stay available."
                )
              }
            >
              One-click rollback
            </Button>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <h3 className="mb-1 text-xs text-zinc-500">Recent beta feedback</h3>
              {dash.rollout.recentBetaFeedback.length === 0 ? (
                <Empty />
              ) : (
                <ul className="max-h-32 overflow-auto font-mono text-xs space-y-1">
                  {dash.rollout.recentBetaFeedback.map((f) => (
                    <li key={f.id}>
                      [{f.category}] {f.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="mb-1 text-xs text-zinc-500">
                Technical error sessions (scrubbed)
              </h3>
              {dash.rollout.recentErrorSessions.length === 0 ? (
                <Empty />
              ) : (
                <ul className="max-h-32 overflow-auto font-mono text-xs space-y-1">
                  {dash.rollout.recentErrorSessions.map((e) => (
                    <li key={e.id}>
                      {e.message}
                      {e.path ? ` @ ${e.path}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>
      ) : null}

      <Card title="Recent audit">
        {dash.recentAudit.length === 0 ? (
          <Empty text="No audited actions yet" />
        ) : (
          <ul className="max-h-56 space-y-2 overflow-auto font-mono text-xs">
            {dash.recentAudit.map((a) => (
              <li key={a.id} className="border-t border-zinc-800/80 pt-2">
                <div>
                  {a.createdAt} · {a.action}
                </div>
                <div className="text-zinc-500">
                  actor {a.actorUserId.slice(0, 8)}… · confirm{" "}
                  {a.confirmToken ?? "—"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
