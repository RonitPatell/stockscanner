"use client";

import { useEffect, useRef, useState } from "react";

type SessionMeta = {
  id: string;
  frameCount: number;
  fromMs: number;
  toMs: number;
  symbolScope: string[];
  schemaVersion: string;
};

type CalibrationReport = {
  version: string;
  sessionId: string;
  sampleFrames: number;
  disclaimer: string;
  intensityByState: Array<{
    state: string;
    intensity: { n: number; mean: number; ci95Low: number; ci95High: number };
    histogram: Record<string, number>;
  }>;
  stateDuration: Array<{
    state: string;
    durationMs: { n: number; mean: number; ci95Low: number; ci95High: number };
  }>;
  transitions: Array<{ from: string; to: string; count: number }>;
  falseOnePrintBreakouts: {
    n: number;
    count: number;
    rate: number;
    ci95Low: number;
    ci95High: number;
  };
  leaderChurn: {
    leaderChanges: number;
    frames: number;
    churnPerThousandFrames: number;
  };
  staleData: {
    staleFrameShare: {
      n: number;
      count: number;
      rate: number;
      ci95Low: number;
      ci95High: number;
    };
    approxStaleMs: number;
  };
  missingQuotes: {
    n: number;
    count: number;
    rate: number;
    ci95Low: number;
    ci95High: number;
  };
  outcomesAfterState: Array<{
    fromState: string;
    intensityDelta: { n: number; mean: number; ci95Low: number; ci95High: number };
    horizonMs: number;
    n: number;
  }>;
};

type ShadowReport = {
  productionEngine: string;
  candidateEngine: string;
  pairs: number;
  stateAgreement: { rate: number; n: number; ci95Low: number; ci95High: number };
  intensityAbsDelta: { mean: number; n: number; ci95Low: number; ci95High: number };
  rankAbsDelta: { mean: number; n: number; ci95Low: number; ci95High: number };
  leaderDisagreement: { rate: number; n: number; ci95Low: number; ci95High: number };
  userOutputUnchanged: true;
  note: string;
};

type PlayerView = {
  player: {
    cursorMs: number;
    speed: number;
    playing: boolean;
    visibleCount: number;
    index: number;
  };
  session: { fromMs: number; toMs: number; frameCount: number };
  latestBySymbol: Record<
    string,
    {
      symbol: string;
      asOfMs: number;
      momentum: { intensity: number | null; state: string | null };
      attention: { rank: number | null; priority: number | null };
      dataQuality: string;
      versions: { momentum: string; configHash: string };
    }
  >;
};

function fmtMs(ms: number): string {
  return new Date(ms).toISOString().slice(11, 19);
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function ciMean(m: { mean: number; ci95Low: number; ci95High: number; n: number }): string {
  return `${m.mean.toFixed(3)} [${m.ci95Low.toFixed(3)}, ${m.ci95High.toFixed(3)}] (n=${m.n})`;
}

export function AdminMonitorCalibrationClient() {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [sessionId, setSessionId] = useState("fixture-monitor-replay-v1");
  const [report, setReport] = useState<CalibrationReport | null>(null);
  const [shadow, setShadow] = useState<ShadowReport | null>(null);
  const [player, setPlayer] = useState<PlayerView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const raf = useRef<number | null>(null);
  const lastTick = useRef<number>(0);

  async function loadSessions() {
    const res = await fetch("/api/admin/monitor-replay");
    if (!res.ok) throw new Error("Failed to list sessions");
    const data = (await res.json()) as { sessions: SessionMeta[] };
    setSessions(data.sessions);
  }

  async function loadReport(id: string) {
    const res = await fetch(`/api/admin/monitor-calibration?sessionId=${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error("Failed to load calibration");
    setReport((await res.json()) as CalibrationReport);
  }

  async function loadPlayer(id: string) {
    const res = await fetch(
      `/api/admin/monitor-replay?id=${encodeURIComponent(id)}&view=player`
    );
    if (!res.ok) throw new Error("Failed to load replay player");
    setPlayer((await res.json()) as PlayerView);
  }

  async function control(body: Record<string, unknown>) {
    const res = await fetch("/api/admin/monitor-replay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, ...body }),
    });
    if (!res.ok) throw new Error("Replay control failed");
    setPlayer((await res.json()) as PlayerView);
  }

  async function runShadow() {
    setError(null);
    const res = await fetch("/api/admin/monitor-calibration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "shadow_compare",
        productionSessionId: sessionId,
        candidateSessionId: `${sessionId}-candidate`,
      }),
    });
    if (!res.ok) {
      setError("Shadow compare failed");
      return;
    }
    setShadow((await res.json()) as ShadowReport);
  }

  useEffect(() => {
    void (async () => {
      try {
        await loadSessions();
        await loadReport(sessionId);
        await loadPlayer(sessionId);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Load failed");
      }
    })();
  }, []);

  useEffect(() => {
    if (!player?.player.playing) {
      if (raf.current != null) cancelAnimationFrame(raf.current);
      raf.current = null;
      return;
    }
    lastTick.current = performance.now();
    const loop = (now: number) => {
      const elapsed = now - lastTick.current;
      if (elapsed >= 200) {
        lastTick.current = now;
        void control({ action: "tick", elapsedWallMs: elapsed });
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
    };
  }, [player?.player.playing, player?.player.speed, sessionId]);

  return (
    <div className="space-y-8">
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-100">Session</h2>
        <div className="flex flex-wrap items-center gap-3">
          <select
            className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100"
            value={sessionId}
            onChange={(e) => {
              const id = e.target.value;
              setSessionId(id);
              void loadReport(id);
              void loadPlayer(id);
            }}
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id} ({s.frameCount} frames)
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
            onClick={() => void runShadow()}
          >
            Shadow compare vs candidate
          </button>
        </div>
        <p className="text-xs text-zinc-500">
          Compact versioned frames only. Descriptive diagnostics — not a trading forecast.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-100">Replay</h2>
        {player ? (
          <>
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                className="rounded border border-zinc-600 px-2 py-1 hover:bg-zinc-800"
                onClick={() => void control({ action: player.player.playing ? "pause" : "play" })}
              >
                {player.player.playing ? "Pause" : "Play"}
              </button>
              {([1, 2, 5] as const).map((sp) => (
                <button
                  key={sp}
                  type="button"
                  className={`rounded border px-2 py-1 ${
                    player.player.speed === sp
                      ? "border-emerald-500 text-emerald-300"
                      : "border-zinc-600 hover:bg-zinc-800"
                  }`}
                  onClick={() => void control({ action: "speed", speed: sp })}
                >
                  {sp}x
                </button>
              ))}
              <button
                type="button"
                className="rounded border border-zinc-600 px-2 py-1 hover:bg-zinc-800"
                onClick={() => void control({ action: "step_backward" })}
              >
                Step −
              </button>
              <button
                type="button"
                className="rounded border border-zinc-600 px-2 py-1 hover:bg-zinc-800"
                onClick={() => void control({ action: "step_forward" })}
              >
                Step +
              </button>
            </div>
            <div className="text-xs text-zinc-400">
              cursor {fmtMs(player.player.cursorMs)} · visible {player.player.visibleCount} /{" "}
              {player.session.frameCount} · as-of only (no look-ahead)
            </div>
            <input
              type="range"
              className="w-full"
              min={player.session.fromMs}
              max={player.session.toMs}
              value={player.player.cursorMs}
              onChange={(e) =>
                void control({ action: "seek", cursorMs: Number(e.target.value) })
              }
            />
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.values(player.latestBySymbol).map((f) => (
                <div
                  key={f.symbol}
                  className="rounded border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-300"
                >
                  <div className="font-medium text-zinc-100">{f.symbol}</div>
                  <div>
                    state {f.momentum.state ?? "—"} · intensity{" "}
                    {f.momentum.intensity?.toFixed(2) ?? "—"}
                  </div>
                  <div>
                    rank {f.attention.rank ?? "—"} · priority{" "}
                    {f.attention.priority?.toFixed(1) ?? "—"}
                  </div>
                  <div>
                    DQ {f.dataQuality} · eng {f.versions.momentum}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-zinc-500">Loading player…</p>
        )}
      </section>

      {shadow ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-100">Shadow compare</h2>
          <p className="text-xs text-emerald-400/90">{shadow.note}</p>
          <div className="grid gap-2 text-xs text-zinc-300 sm:grid-cols-2">
            <div>
              Production {shadow.productionEngine}
              <br />
              Candidate {shadow.candidateEngine}
            </div>
            <div>Aligned pairs {shadow.pairs}</div>
            <div>
              State agreement {pct(shadow.stateAgreement.rate)} [
              {pct(shadow.stateAgreement.ci95Low)}, {pct(shadow.stateAgreement.ci95High)}]
            </div>
            <div>Intensity |Δ| {ciMean(shadow.intensityAbsDelta)}</div>
            <div>Rank |Δ| {ciMean(shadow.rankAbsDelta)}</div>
            <div>
              Leader disagreement {pct(shadow.leaderDisagreement.rate)} (n=
              {shadow.leaderDisagreement.n})
            </div>
          </div>
        </section>
      ) : null}

      {report ? (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-100">Calibration</h2>
            <p className="text-xs text-zinc-500">{report.disclaimer}</p>
            <p className="text-xs text-zinc-400">
              {report.version} · session {report.sessionId} · frames {report.sampleFrames}
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Intensity by state
            </h3>
            <div className="space-y-1 text-xs text-zinc-300">
              {report.intensityByState.map((row) => (
                <div key={row.state}>
                  {row.state}: {ciMean(row.intensity)}
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              State duration (ms)
            </h3>
            <div className="space-y-1 text-xs text-zinc-300">
              {report.stateDuration.map((row) => (
                <div key={row.state}>
                  {row.state}: {ciMean(row.durationMs)}
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Transitions
            </h3>
            <div className="space-y-1 text-xs text-zinc-300">
              {report.transitions.slice(0, 12).map((t) => (
                <div key={`${t.from}->${t.to}`}>
                  {t.from} → {t.to}: {t.count}
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-3 text-xs text-zinc-300 sm:grid-cols-2">
            <div className="rounded border border-zinc-800 p-3">
              False one-print breakouts: {pct(report.falseOnePrintBreakouts.rate)} [
              {pct(report.falseOnePrintBreakouts.ci95Low)},{" "}
              {pct(report.falseOnePrintBreakouts.ci95High)}] (n=
              {report.falseOnePrintBreakouts.n})
            </div>
            <div className="rounded border border-zinc-800 p-3">
              Leader churn: {report.leaderChurn.leaderChanges} changes ·{" "}
              {report.leaderChurn.churnPerThousandFrames.toFixed(2)} / 1k frames
            </div>
            <div className="rounded border border-zinc-800 p-3">
              Stale / degraded frames: {pct(report.staleData.staleFrameShare.rate)} · ≈
              {(report.staleData.approxStaleMs / 1000).toFixed(0)}s session time
            </div>
            <div className="rounded border border-zinc-800 p-3">
              Missing / unreliable quotes: {pct(report.missingQuotes.rate)} [
              {pct(report.missingQuotes.ci95Low)}, {pct(report.missingQuotes.ci95High)}]
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Outcomes after state (intensity Δ, descriptive)
            </h3>
            <div className="space-y-1 text-xs text-zinc-300">
              {report.outcomesAfterState.map((o) => (
                <div key={o.fromState}>
                  {o.fromState} @ {(o.horizonMs / 1000).toFixed(0)}s: {ciMean(o.intensityDelta)}
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
