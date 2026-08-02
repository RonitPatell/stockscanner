"use client";

import { useMemo, useState } from "react";
import {
  exportStrategies,
  importStrategies,
  instantiateMonitorPreset,
  monitorPresetCatalog,
  explainWhyTickerDidNotMatch,
  factsFromMonitorSymbol,
  replayMonitorPresetPreview,
  summarizeMonitorPreset,
  validateStrategy,
  type AlertStrategy,
  type StrategyPresetId,
  type SimulationCatalystRow,
} from "@/lib/alert-strategy";

export interface MonitorPresetPanelProps {
  strategy: AlertStrategy | null;
  onStrategyChange: (strategy: AlertStrategy | null) => void;
  /** Facts builder for search miss explain */
  resolveFacts: (symbol: string) => ReturnType<typeof factsFromMonitorSymbol> | null;
  /** Optional historical rows for replay preview */
  replayRows?: SimulationCatalystRow[];
  watchlistSymbols?: string[];
}

/**
 * Monitor preset picker — Alert Strategy Builder templates + summary,
 * validation, export/import, match miss explain, replay preview.
 */
export function MonitorPresetPanel({
  strategy,
  onStrategyChange,
  resolveFacts,
  replayRows = [],
  watchlistSymbols = [],
}: MonitorPresetPanelProps) {
  const catalog = useMemo(() => monitorPresetCatalog(), []);
  const [missSymbol, setMissSymbol] = useState("");
  const [missReasons, setMissReasons] = useState<string[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [replayOpen, setReplayOpen] = useState(false);

  const summary = strategy ? summarizeMonitorPreset(strategy) : null;
  const validation = strategy ? validateStrategy(strategy) : null;

  const applyPreset = (id: StrategyPresetId) => {
    const built = instantiateMonitorPreset(id);
    onStrategyChange(built.strategy);
    setMissReasons([]);
    setImportError(null);
  };

  const onExport = () => {
    if (!strategy) return;
    const bundle = exportStrategies([strategy]);
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `monitor-preset-${strategy.presetId}-v${strategy.version}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImportFile = async (file: File) => {
    setImportError(null);
    try {
      const text = await file.text();
      const raw = JSON.parse(text) as unknown;
      const result = importStrategies(raw, { replaceIds: true });
      if (!result.ok || !result.strategies[0]) {
        setImportError(result.errors.join("; ") || "Import failed validation");
        return;
      }
      // Imported copy is always a new id/version — never silent overwrite.
      onStrategyChange(result.strategies[0]!);
    } catch {
      setImportError("Invalid JSON");
    }
  };

  const onExplainMiss = () => {
    if (!strategy) return;
    const sym = missSymbol.trim().toUpperCase();
    if (!sym) return;
    const facts = resolveFacts(sym);
    if (!facts) {
      setMissReasons([`${sym}: no Monitor facts available for this symbol.`]);
      return;
    }
    setMissReasons(explainWhyTickerDidNotMatch(strategy, facts));
  };

  const replay = useMemo(() => {
    if (!strategy || !replayOpen || replayRows.length === 0) return null;
    return replayMonitorPresetPreview(strategy, replayRows, {
      watchlistSymbols,
    });
  }, [strategy, replayOpen, replayRows, watchlistSymbols]);

  return (
    <div
      className="tt-monitor-preset"
      data-guide="monitor-preset"
      data-testid="monitor-preset-panel"
    >
      <div className="tt-monitor__panel-h">
        <span>Monitor preset</span>
        <span className="tt-monitor-preset__ver">
          {strategy
            ? `v${strategy.version} · ${strategy.presetId}`
            : "None"}
        </span>
      </div>

      <div className="tt-monitor-preset__chips" role="list">
        <button
          type="button"
          className="tt-monitor__pill"
          data-active={!strategy ? "true" : "false"}
          onClick={() => onStrategyChange(null)}
        >
          Off
        </button>
        {catalog.map((p) => (
          <button
            key={p.id}
            type="button"
            className="tt-monitor__pill"
            data-active={strategy?.presetId === p.id ? "true" : "false"}
            title={p.blurb}
            onClick={() => applyPreset(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {summary && (
        <p className="tt-monitor-preset__summary" data-testid="monitor-preset-summary">
          {summary.headline}
          <span className="tt-monitor-preset__meta"> · {summary.versionLabel}</span>
        </p>
      )}

      {validation && validation.issues.length > 0 && (
        <ul
          className="tt-monitor-preset__issues"
          data-testid="monitor-preset-issues"
        >
          {validation.issues.map((i) => (
            <li key={`${i.code}-${i.path}`} data-severity={i.severity}>
              {i.severity === "error" ? "Error" : "Warning"}: {i.message}
            </li>
          ))}
        </ul>
      )}

      <div className="tt-monitor-preset__actions">
        <button
          type="button"
          className="tt-monitor__drawer-btn"
          disabled={!strategy}
          onClick={onExport}
          data-testid="monitor-preset-export"
        >
          Export JSON
        </button>
        <label className="tt-monitor__drawer-btn">
          Import JSON
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            data-testid="monitor-preset-import"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImportFile(f);
              e.target.value = "";
            }}
          />
        </label>
        <button
          type="button"
          className="tt-monitor__drawer-btn"
          disabled={!strategy || replayRows.length === 0}
          onClick={() => setReplayOpen((v) => !v)}
          data-testid="monitor-preset-replay"
        >
          {replayOpen ? "Hide replay" : "Replay preview"}
        </button>
        <a
          className="tt-monitor__drawer-btn"
          href="/settings#alert-strategy"
          title="Edit full rules in Alert Strategy Builder"
        >
          Open builder
        </a>
      </div>

      {importError && (
        <p className="tt-monitor-preset__warn" role="alert">
          {importError}
        </p>
      )}

      {replay && (
        <div
          className="tt-monitor-preset__replay"
          data-testid="monitor-preset-replay-result"
        >
          <p>
            Historical preview: {replay.matchedCount}/{replay.sampleSize} matched
            {replay.matchRate != null
              ? ` (${(replay.matchRate * 100).toFixed(0)}%)`
              : ""}
            . Strategy v{replay.strategyVersion}.
          </p>
          <p className="tt-monitor-preset__meta">{replay.disclaimer}</p>
        </div>
      )}

      <div className="tt-monitor-preset__miss">
        <label>
          Why didn’t a ticker match?
          <input
            className="tt-monitor__search"
            placeholder="Symbol"
            value={missSymbol}
            onChange={(e) => setMissSymbol(e.target.value)}
            aria-label="Symbol for match explain"
          />
        </label>
        <button
          type="button"
          className="tt-monitor__drawer-btn"
          disabled={!strategy || !missSymbol.trim()}
          onClick={onExplainMiss}
          data-testid="monitor-preset-explain-miss"
        >
          Explain
        </button>
      </div>
      {missReasons.length > 0 && (
        <ul
          className="tt-monitor-preset__miss-list"
          data-testid="monitor-preset-miss-reasons"
        >
          {missReasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
