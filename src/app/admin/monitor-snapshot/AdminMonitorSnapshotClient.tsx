"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type FieldFreshness = {
  field: string;
  verdict: string;
  reason: string;
  providerTimeMs: number | null;
  timeQuality: string;
  ageMs: number | null;
};

type Diagnostics = {
  schemaVersion: string;
  calculationVersion: string;
  currentSnapshotId: string | null;
  previousSnapshotId: string | null;
  snapshotAgeMs: number | null;
  underlyingDataAgeMs: number | null;
  generationDurationMs: number | null;
  liveLabel: string | null;
  liveEligible: boolean;
  sourceHealth: {
    quotes: string;
    catalysts: string;
    halts: string;
    coverage: string;
    notes: string[];
  } | null;
  excludedTickers: Array<{ symbol: string; reason: string; stage: string }>;
  leaderExclusions: Array<{ symbol: string; reason: string }>;
  staleTickers: Array<{
    symbol: string;
    freshnessVerdict: string;
    lastQuoteAtMs: number | null;
    lastMarketEventAtMs: number | null;
    leaderEligible: boolean;
    leaderIneligibleReason: string | null;
    fieldFreshness: FieldFreshness[];
    sourceHealth: {
      quotes: string;
      catalysts: string;
      trades: string;
      notes: string[];
    };
  }>;
  conflictedMappings: string[];
  failedValidation: Array<{
    id: string;
    stage: string;
    message: string;
    createdAt: string;
  }>;
  exclusionLog: Array<{
    id: string;
    stage: string;
    message: string;
    createdAt: string;
  }>;
  active: {
    snapshotId: string;
    leader: string | null;
    dataQuality: string;
    recovery: boolean;
    marketSession: string;
    generatedAt: string;
    tickers: Array<{
      symbol: string;
      rank: number | null;
      freshnessVerdict: string;
      snapshotGeneratedAtMs: number;
      lastMarketEventAtMs: number | null;
      lastQuoteAtMs: number | null;
      lastTradeAtMs: number | null;
      lastCatalystAtMs: number | null;
      momentumCalculatedAtMs: number | null;
      priorityCalculatedAtMs: number | null;
      tradeabilityCalculatedAtMs: number | null;
      leaderEligible: boolean;
      leaderIneligibleReason: string | null;
      calculationVersion: string;
    }>;
  } | null;
  previous: {
    snapshotId: string;
    generatedAt: string;
    leader: string | null;
    liveLabel: string | null;
  } | null;
  recentErrors: Array<{
    id: string;
    stage: string;
    message: string;
    createdAt: string;
  }>;
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

function fmtAge(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} m`;
}

function fmtTs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  return new Date(ms).toISOString();
}

export function AdminMonitorSnapshotClient() {
  const [data, setData] = useState<Diagnostics | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(() => {
    void fetch("/api/admin/monitor-snapshot")
      .then(async (r) => {
        if (!r.ok) {
          throw new Error(
            (await r.json().catch(() => ({}))).error ?? "Load failed"
          );
        }
        return r.json();
      })
      .then((d: Diagnostics) => setData(d))
      .catch((e: Error) => setMessage(e.message || "Failed to load"));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  const action = async (name: "rebuild" | "rollback") => {
    if (
      !window.confirm(
        name === "rebuild"
          ? "Rebuild snapshot from delivery hub?"
          : "Rollback to previous valid snapshot?"
      )
    ) {
      return;
    }
    const res = await fetch("/api/admin/monitor-snapshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: name }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(body.error ?? "Action failed");
      return;
    }
    setMessage(`OK: ${name}`);
    load();
  };

  if (!data) {
    return (
      <p className="text-sm text-zinc-400">{message || "Loading snapshot…"}</p>
    );
  }

  return (
    <div
      className="space-y-6 text-sm text-zinc-300"
      data-testid="monitor-snapshot-freshness"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={load}>
          Refresh
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void action("rebuild")}
        >
          Rebuild
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void action("rollback")}
        >
          Rollback
        </Button>
        {message ? (
          <span className="text-xs text-amber-300/90" role="status">
            {message}
          </span>
        ) : null}
      </div>

      <Card title="Snapshot identity">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          <Metric label="Current ID" value={data.currentSnapshotId ?? "—"} />
          <Metric label="Previous ID" value={data.previousSnapshotId ?? "—"} />
          <Metric label="Schema" value={data.schemaVersion} />
          <Metric label="Calculation" value={data.calculationVersion} />
          <Metric
            label="Snapshot age"
            value={fmtAge(data.snapshotAgeMs)}
          />
          <Metric
            label="Underlying data age"
            value={fmtAge(data.underlyingDataAgeMs)}
          />
          <Metric
            label="Generation duration"
            value={fmtAge(data.generationDurationMs)}
          />
          <Metric
            label="Live label"
            value={`${data.liveLabel ?? "—"} (${data.liveEligible ? "eligible" : "not live"})`}
          />
          <Metric
            label="Leader"
            value={data.active?.leader ?? "—"}
          />
          <Metric
            label="Session"
            value={data.active?.marketSession ?? "—"}
          />
          <Metric
            label="Data quality"
            value={data.active?.dataQuality ?? "—"}
          />
          <Metric
            label="Recovery"
            value={data.active?.recovery ? "yes" : "no"}
          />
        </div>
        <p className="text-xs text-zinc-500">
          Snapshot age is serialization time only. Live eligibility uses
          underlying provider market inputs.
        </p>
      </Card>

      <Card title="Source health">
        {data.sourceHealth ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Quotes" value={data.sourceHealth.quotes} />
            <Metric label="Catalysts" value={data.sourceHealth.catalysts} />
            <Metric label="Halts" value={data.sourceHealth.halts} />
            <Metric label="Coverage" value={data.sourceHealth.coverage} />
          </div>
        ) : (
          <p className="text-xs text-zinc-500">No active snapshot</p>
        )}
        {data.sourceHealth?.notes?.length ? (
          <ul className="list-disc pl-5 text-xs text-zinc-500">
            {data.sourceHealth.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card title="Excluded tickers">
        {data.excludedTickers.length === 0 ? (
          <p className="text-xs text-zinc-500">None in current snapshot</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-zinc-500">
                <tr>
                  <th className="py-1 pr-3">Symbol</th>
                  <th className="py-1 pr-3">Stage</th>
                  <th className="py-1">Reason</th>
                </tr>
              </thead>
              <tbody>
                {data.excludedTickers.map((e, i) => (
                  <tr key={`${e.symbol}-${i}`} className="border-t border-zinc-800/80">
                    <td className="py-1 pr-3 font-mono">{e.symbol}</td>
                    <td className="py-1 pr-3">{e.stage}</td>
                    <td className="py-1 text-zinc-400">{e.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.conflictedMappings.length > 0 ? (
          <p className="text-xs text-amber-300/90">
            Conflicted mappings quarantined:{" "}
            {data.conflictedMappings.join(", ")}
          </p>
        ) : null}
      </Card>

      <Card title="Stale / ineligible tickers">
        {data.staleTickers.length === 0 ? (
          <p className="text-xs text-zinc-500">None marked stale</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-zinc-500">
                <tr>
                  <th className="py-1 pr-3">Symbol</th>
                  <th className="py-1 pr-3">Verdict</th>
                  <th className="py-1 pr-3">Quote</th>
                  <th className="py-1 pr-3">Market event</th>
                  <th className="py-1">Leader</th>
                </tr>
              </thead>
              <tbody>
                {data.staleTickers.map((t) => (
                  <tr key={t.symbol} className="border-t border-zinc-800/80">
                    <td className="py-1 pr-3 font-mono">{t.symbol}</td>
                    <td className="py-1 pr-3">{t.freshnessVerdict}</td>
                    <td className="py-1 pr-3">{fmtTs(t.lastQuoteAtMs)}</td>
                    <td className="py-1 pr-3">{fmtTs(t.lastMarketEventAtMs)}</td>
                    <td className="py-1 text-zinc-400">
                      {t.leaderEligible
                        ? "eligible"
                        : t.leaderIneligibleReason ?? "no"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Active ladder timestamps">
        {!data.active?.tickers?.length ? (
          <p className="text-xs text-zinc-500">No ladder</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="text-zinc-500">
                <tr>
                  <th className="py-1 pr-2">Sym</th>
                  <th className="py-1 pr-2">Gen</th>
                  <th className="py-1 pr-2">Quote</th>
                  <th className="py-1 pr-2">Trade</th>
                  <th className="py-1 pr-2">Catalyst</th>
                  <th className="py-1 pr-2">Mom</th>
                  <th className="py-1 pr-2">Pri</th>
                  <th className="py-1 pr-2">Tradeab</th>
                  <th className="py-1">Fresh</th>
                </tr>
              </thead>
              <tbody>
                {data.active.tickers.map((t) => (
                  <tr key={t.symbol} className="border-t border-zinc-800/80">
                    <td className="py-1 pr-2 font-mono">{t.symbol}</td>
                    <td className="py-1 pr-2">{fmtTs(t.snapshotGeneratedAtMs)}</td>
                    <td className="py-1 pr-2">{fmtTs(t.lastQuoteAtMs)}</td>
                    <td className="py-1 pr-2">{fmtTs(t.lastTradeAtMs)}</td>
                    <td className="py-1 pr-2">{fmtTs(t.lastCatalystAtMs)}</td>
                    <td className="py-1 pr-2">{fmtTs(t.momentumCalculatedAtMs)}</td>
                    <td className="py-1 pr-2">{fmtTs(t.priorityCalculatedAtMs)}</td>
                    <td className="py-1 pr-2">
                      {fmtTs(t.tradeabilityCalculatedAtMs)}
                    </td>
                    <td className="py-1">{t.freshnessVerdict}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Failed validation / exclusions log">
        {data.failedValidation.length === 0 &&
        data.exclusionLog.length === 0 ? (
          <p className="text-xs text-zinc-500">No recent failures</p>
        ) : (
          <ul className="space-y-1 text-xs text-zinc-400">
            {[...data.failedValidation, ...data.exclusionLog].map((e) => (
              <li key={e.id}>
                <span className="font-mono text-zinc-500">{e.createdAt}</span>{" "}
                [{e.stage}] {e.message}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {data.previous ? (
        <Card title="Previous snapshot">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="ID" value={data.previous.snapshotId} />
            <Metric label="Generated" value={data.previous.generatedAt} />
            <Metric label="Leader" value={data.previous.leader ?? "—"} />
            <Metric label="Live label" value={data.previous.liveLabel ?? "—"} />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
