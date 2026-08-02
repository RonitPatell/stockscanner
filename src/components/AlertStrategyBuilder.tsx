"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  Download,
  Upload,
  Play,
  HelpCircle,
  Save,
} from "lucide-react";
import { Button } from "./ui/button";
import type {
  AlertStrategy,
  ConditionField,
  ConditionOp,
  DeliveryBehaviour,
  StrategyCondition,
  StrategyConditionGroup,
  StrategyPresetId,
  SimulationResult,
  StrategyExplainResult,
  StrategyValidationIssue,
} from "@/lib/alert-strategy/types";
import { STRATEGY_PRESET_META } from "@/lib/alert-strategy/presets";
import { summarizeStrategy } from "@/lib/alert-strategy/summarize";
import { validateStrategy } from "@/lib/alert-strategy/validate";

const FIELDS: { value: ConditionField; label: string }[] = [
  { value: "watchlist_membership", label: "Watchlist membership" },
  { value: "price", label: "Price" },
  { value: "float_m", label: "Float (M)" },
  { value: "float_confidence", label: "Float confidence" },
  { value: "market_cap_m", label: "Market cap (M)" },
  { value: "catalyst_category", label: "Catalyst category" },
  { value: "source_tier", label: "Source tier" },
  { value: "source_verification", label: "Source verification" },
  { value: "confirmation_count", label: "Confirmation count" },
  { value: "catalyst_strength", label: "Catalyst strength" },
  { value: "reaction_stage", label: "Reaction stage" },
  { value: "relative_volume", label: "Relative volume" },
  { value: "dollar_volume", label: "Dollar volume" },
  { value: "dollar_volume_velocity", label: "Dollar-volume velocity" },
  { value: "trades_per_second", label: "Trades per second" },
  { value: "pct_move", label: "% move" },
  { value: "spread_bps", label: "Spread (bps)" },
  { value: "tradeability", label: "Tradeability" },
  { value: "dilution_flag", label: "Dilution flags" },
  { value: "risk_flag", label: "Risk include/exclude" },
  { value: "market_session", label: "Market session" },
  { value: "halt_status", label: "Halt status" },
  { value: "resumption_flag", label: "Resumption flag" },
  { value: "momentum_state", label: "Momentum state" },
  { value: "momentum_intensity", label: "Min momentum intensity" },
  { value: "attention_priority", label: "Min attention priority" },
  { value: "max_catalyst_age_min", label: "Max catalyst age (min)" },
  { value: "ticker_exclusion", label: "Ticker exclusions" },
  { value: "sector", label: "Sector" },
  { value: "exchange", label: "Exchange" },
];

const OPS: ConditionOp[] = [
  "eq",
  "neq",
  "in",
  "not_in",
  "gte",
  "lte",
  "between",
  "is_true",
  "is_false",
];

const CHANNELS = ["discord", "sms", "email", "push"] as const;
const DELIVERIES: DeliveryBehaviour[] = ["EARLY", "CONFIRMED", "RISK_ONLY"];

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function newCondition(): StrategyCondition {
  return {
    id: newId("c"),
    field: "watchlist_membership",
    op: "is_true",
    value: true,
  };
}

interface Props {
  /** Called after successful server save so parent can sync */
  onSaved?: (strategies: AlertStrategy[]) => void;
}

export function AlertStrategyBuilder({ onSaved }: Props) {
  const [strategies, setStrategies] = useState<AlertStrategy[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [issues, setIssues] = useState<StrategyValidationIssue[]>([]);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [explanation, setExplanation] = useState<StrategyExplainResult | null>(
    null
  );
  const [explainSymbol, setExplainSymbol] = useState("");
  const [saving, setSaving] = useState(false);
  const [muteTicker, setMuteTicker] = useState("");
  const [importText, setImportText] = useState("");

  const active = strategies.find((s) => s.id === activeId) ?? strategies[0] ?? null;

  useEffect(() => {
    fetch("/api/alert-strategies")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data.strategies) ? data.strategies : [];
        setStrategies(list);
        if (list[0]) setActiveId(list[0].id);
        setLoading(false);
      })
      .catch(() => {
        setError("Could not load strategies");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!active) {
      setIssues([]);
      return;
    }
    setIssues(validateStrategy(active).issues);
  }, [active]);

  const patchActive = (patch: Partial<AlertStrategy>) => {
    if (!active) return;
    setStrategies((prev) =>
      prev.map((s) => (s.id === active.id ? { ...s, ...patch } : s))
    );
  };

  const patchRoot = (root: StrategyConditionGroup) => {
    patchActive({ root });
  };

  const updateCondition = (
    condId: string,
    patch: Partial<StrategyCondition>,
    group: StrategyConditionGroup = active!.root
  ): StrategyConditionGroup => {
    return {
      ...group,
      conditions: group.conditions.map((c) =>
        c.id === condId ? { ...c, ...patch } : c
      ),
      groups: group.groups?.map((g) => updateCondition(condId, patch, g)),
    };
  };

  const addCondition = (groupId: string) => {
    if (!active) return;
    const walk = (g: StrategyConditionGroup): StrategyConditionGroup => {
      if (g.id === groupId) {
        return { ...g, conditions: [...g.conditions, newCondition()] };
      }
      return {
        ...g,
        groups: g.groups?.map(walk),
      };
    };
    patchRoot(walk(active.root));
  };

  const removeCondition = (condId: string) => {
    if (!active) return;
    const walk = (g: StrategyConditionGroup): StrategyConditionGroup => ({
      ...g,
      conditions: g.conditions.filter((c) => c.id !== condId),
      groups: g.groups?.map(walk),
    });
    patchRoot(walk(active.root));
  };

  const setGroupLogic = (groupId: string, logic: "AND" | "OR") => {
    if (!active) return;
    const walk = (g: StrategyConditionGroup): StrategyConditionGroup => {
      if (g.id === groupId) return { ...g, logic };
      return { ...g, groups: g.groups?.map(walk) };
    };
    patchRoot(walk(active.root));
  };

  const addNestedGroup = (parentId: string) => {
    if (!active) return;
    const nested: StrategyConditionGroup = {
      id: newId("g"),
      logic: "OR",
      conditions: [newCondition()],
      groups: [],
    };
    const walk = (g: StrategyConditionGroup): StrategyConditionGroup => {
      if (g.id === parentId) {
        return { ...g, groups: [...(g.groups ?? []), nested] };
      }
      return { ...g, groups: g.groups?.map(walk) };
    };
    patchRoot(walk(active.root));
  };

  const createFromPreset = async (presetId: StrategyPresetId) => {
    setError("");
    const res = await fetch("/api/alert-strategies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "preset", presetId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not create preset");
      return;
    }
    setStrategies(data.strategies ?? []);
    if (data.strategy) setActiveId(data.strategy.id);
    onSaved?.(data.strategies ?? []);
  };

  const handleSave = async () => {
    if (!active) return;
    setSaving(true);
    setError("");
    const res = await fetch("/api/alert-strategies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save",
        strategy: active,
        expectedVersion: active.version,
        changeNote: "Explicit save from Strategy Builder",
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Save failed");
      setIssues(data.issues ?? []);
      return;
    }
    setStrategies(data.strategies ?? []);
    if (data.strategy) setActiveId(data.strategy.id);
    onSaved?.(data.strategies ?? []);
  };

  const handleDelete = async () => {
    if (!active) return;
    const res = await fetch(`/api/alert-strategies?id=${encodeURIComponent(active.id)}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Delete failed");
      return;
    }
    setStrategies(data.strategies ?? []);
    setActiveId(data.strategies?.[0]?.id ?? null);
    onSaved?.(data.strategies ?? []);
  };

  const handleSimulate = async () => {
    if (!active) return;
    setSimulation(null);
    const res = await fetch("/api/alert-strategies/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "simulate",
        strategy: active,
        lookbackDays: 14,
        maxSample: 200,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Simulation failed");
      return;
    }
    setSimulation(data.simulation);
  };

  const handleExplain = async (mode: "why" | "whyNot") => {
    if (!active || !explainSymbol.trim()) return;
    setExplanation(null);
    const res = await fetch("/api/alert-strategies/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "explain",
        strategy: active,
        symbol: explainSymbol.trim().toUpperCase(),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Explain failed");
      return;
    }
    setExplanation(data.explanation);
    void mode;
  };

  const handleExport = async () => {
    const res = await fetch("/api/alert-strategies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "export" }),
    });
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trustticker-alert-strategies.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    if (!importText.trim()) return;
    let payload: unknown;
    try {
      payload = JSON.parse(importText);
    } catch {
      setError("Import JSON is invalid");
      return;
    }
    const res = await fetch("/api/alert-strategies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "import", payload, merge: true }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Import failed");
      return;
    }
    setStrategies(data.strategies ?? []);
    setImportText("");
    onSaved?.(data.strategies ?? []);
  };

  const applyMuteTicker = () => {
    if (!active || !muteTicker.trim()) return;
    const t = muteTicker.trim().toUpperCase();
    const mutes = {
      ...(active.mutes ?? {}),
      tickers: [...new Set([...(active.mutes?.tickers ?? []), t])],
    };
    patchActive({ mutes });
    setMuteTicker("");
  };

  if (loading) {
    return <p className="text-xs text-zinc-500">Loading strategies…</p>;
  }

  const summary = active ? summarizeStrategy(active) : null;
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  return (
    <div className="space-y-4" data-guide="alert-strategy-builder">
      <div className="flex flex-wrap gap-2">
        {STRATEGY_PRESET_META.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => createFromPreset(p.id)}
            className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-300 hover:border-emerald-600"
            title={p.blurb}
          >
            {p.label}
          </button>
        ))}
      </div>

      {strategies.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {strategies.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveId(s.id)}
              className={`rounded px-2 py-1 text-xs ${
                active?.id === s.id
                  ? "bg-emerald-900/40 text-emerald-300 border border-emerald-700"
                  : "bg-zinc-900 text-zinc-400 border border-zinc-800"
              }`}
            >
              {s.name} · v{s.version}
            </button>
          ))}
        </div>
      )}

      {!active ? (
        <p className="text-sm text-zinc-400">
          Start from a preset above. Rules are versioned — nothing changes until you
          save.
        </p>
      ) : (
        <>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={active.name}
                onChange={(e) => patchActive({ name: e.target.value })}
                className="flex-1 min-w-[140px] bg-transparent border-b border-zinc-700 text-sm text-zinc-100 outline-none focus:border-emerald-500"
              />
              <label className="flex items-center gap-1 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={active.enabled}
                  onChange={(e) => patchActive({ enabled: e.target.checked })}
                />
                On
              </label>
              <span className="text-[10px] text-zinc-600">v{active.version}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <label className="text-zinc-500">
                Delivery
                <select
                  value={active.delivery}
                  onChange={(e) =>
                    patchActive({
                      delivery: e.target.value as DeliveryBehaviour,
                    })
                  }
                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-200"
                >
                  {DELIVERIES.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-zinc-500">
                Cooldown (min)
                <input
                  type="number"
                  value={active.cooldownMinutes}
                  onChange={(e) =>
                    patchActive({ cooldownMinutes: Number(e.target.value) || 0 })
                  }
                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-200"
                />
              </label>
              <label className="text-zinc-500">
                Daily cap
                <input
                  type="number"
                  value={active.dailyAlertCap ?? ""}
                  placeholder="∞"
                  onChange={(e) =>
                    patchActive({
                      dailyAlertCap: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-200"
                />
              </label>
              <div className="text-zinc-500">
                Channels
                <div className="mt-1 flex flex-wrap gap-1">
                  {CHANNELS.map((ch) => (
                    <label
                      key={ch}
                      className="flex items-center gap-0.5 text-[10px] text-zinc-400"
                    >
                      <input
                        type="checkbox"
                        checked={active.channels.includes(ch)}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...active.channels, ch]
                            : active.channels.filter((c) => c !== ch);
                          patchActive({ channels: next });
                        }}
                      />
                      {ch}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <GroupEditor
              group={active.root}
              onLogic={(logic) => setGroupLogic(active.root.id, logic)}
              onAddCondition={() => addCondition(active.root.id)}
              onAddGroup={() => addNestedGroup(active.root.id)}
              onUpdateCondition={(id, patch) =>
                patchRoot(updateCondition(id, patch))
              }
              onRemoveCondition={removeCondition}
              onNestedLogic={(gid, logic) => setGroupLogic(gid, logic)}
              onNestedAddCondition={addCondition}
              onNestedAddGroup={addNestedGroup}
            />

            <div className="flex flex-wrap gap-2 items-end">
              <label className="text-xs text-zinc-500">
                Mute ticker
                <input
                  value={muteTicker}
                  onChange={(e) => setMuteTicker(e.target.value.toUpperCase())}
                  className="mt-1 block w-24 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-200"
                  placeholder="TICK"
                />
              </label>
              <Button type="button" variant="outline" size="sm" onClick={applyMuteTicker}>
                Mute
              </Button>
              {active.mutes?.tickers?.length ? (
                <span className="text-[10px] text-amber-400/80">
                  Muted: {active.mutes.tickers.join(", ")}
                </span>
              ) : null}
            </div>
          </div>

          {summary && (
            <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-3 space-y-1">
              <p className="text-sm text-emerald-200 font-medium">
                {summary.headline}
              </p>
              <p className="text-xs text-zinc-400">{summary.delivery}</p>
              <p className="text-xs text-zinc-500">
                {summary.channels} {summary.limits}
              </p>
              {summary.mutes && (
                <p className="text-xs text-amber-400/90">{summary.mutes}</p>
              )}
            </div>
          )}

          {errors.length > 0 && (
            <ul className="text-xs text-red-400 space-y-0.5">
              {errors.map((i) => (
                <li key={i.code + i.message}>{i.message}</li>
              ))}
            </ul>
          )}
          {warnings.length > 0 && (
            <ul className="text-xs text-amber-400/90 space-y-0.5">
              {warnings.map((i) => (
                <li key={i.code + i.message}>{i.message}</li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={saving || errors.length > 0}
            >
              <Save className="w-3.5 h-3.5 mr-1" />
              {saving ? "Saving…" : "Save (new version)"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={handleSimulate}>
              <Play className="w-3.5 h-3.5 mr-1" />
              Simulate history
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={handleExport}>
              <Download className="w-3.5 h-3.5 mr-1" />
              Export JSON
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={handleDelete}>
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Delete
            </Button>
          </div>

          {simulation && (
            <div className="rounded border border-zinc-800 bg-zinc-950/50 p-3 text-xs space-y-1">
              <p className="text-zinc-200">
                Matched <strong>{simulation.matchedCount}</strong> of{" "}
                <strong>{simulation.sampleSize}</strong> historical catalysts
                {simulation.matchRate != null
                  ? ` (${(simulation.matchRate * 100).toFixed(1)}%)`
                  : ""}
                {" "}· strategy v{simulation.strategyVersion}
              </p>
              <p className="text-zinc-500">{simulation.disclaimer}</p>
              <ul className="text-zinc-600 list-disc pl-4">
                {simulation.limitations.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2 items-end border-t border-zinc-800 pt-3">
            <label className="text-xs text-zinc-500">
              Symbol
              <input
                value={explainSymbol}
                onChange={(e) => setExplainSymbol(e.target.value.toUpperCase())}
                className="mt-1 block w-24 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-200"
                placeholder="AAPL"
              />
            </label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => handleExplain("why")}
            >
              <HelpCircle className="w-3.5 h-3.5 mr-1" />
              Why did this alert fire?
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => handleExplain("whyNot")}
            >
              Why was this ticker not alerted?
            </Button>
          </div>

          {explanation && (
            <div className="rounded border border-zinc-800 p-3 text-xs space-y-2">
              <p className="text-zinc-300">
                {explanation.wouldAlert
                  ? "Would alert with current draft"
                  : "Would not alert with current draft"}{" "}
                ({explanation.delivery})
              </p>
              {explanation.why.length > 0 && (
                <div>
                  <p className="text-emerald-400/90 mb-0.5">Why it fires</p>
                  <ul className="list-disc pl-4 text-zinc-400">
                    {explanation.why.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
              {explanation.whyNot.length > 0 && (
                <div>
                  <p className="text-amber-400/90 mb-0.5">Why not</p>
                  <ul className="list-disc pl-4 text-zinc-400">
                    {explanation.whyNot.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs text-zinc-500 flex items-center gap-1">
              <Upload className="w-3 h-3" /> Import JSON
            </label>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={3}
              className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-300 font-mono"
              placeholder='{"format":"trustticker-alert-strategy",...}'
            />
            <Button type="button" size="sm" variant="outline" onClick={handleImport}>
              Import
            </Button>
          </div>
        </>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

function GroupEditor(props: {
  group: StrategyConditionGroup;
  depth?: number;
  onLogic: (logic: "AND" | "OR") => void;
  onAddCondition: () => void;
  onAddGroup: () => void;
  onUpdateCondition: (id: string, patch: Partial<StrategyCondition>) => void;
  onRemoveCondition: (id: string) => void;
  onNestedLogic: (groupId: string, logic: "AND" | "OR") => void;
  onNestedAddCondition: (groupId: string) => void;
  onNestedAddGroup: (groupId: string) => void;
}) {
  const depth = props.depth ?? 0;
  return (
    <div
      className={`space-y-2 rounded border border-zinc-800/80 p-2 ${
        depth > 0 ? "ml-2 bg-zinc-950/40" : ""
      }`}
    >
      <div className="flex items-center gap-2 text-xs">
        <span className="text-zinc-500">Match</span>
        <select
          value={props.group.logic}
          onChange={(e) => props.onLogic(e.target.value as "AND" | "OR")}
          className="rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-zinc-200"
        >
          <option value="AND">ALL (AND)</option>
          <option value="OR">ANY (OR)</option>
        </select>
        <button
          type="button"
          onClick={props.onAddCondition}
          className="text-emerald-400/80 hover:text-emerald-300 flex items-center gap-0.5"
        >
          <Plus className="w-3 h-3" /> condition
        </button>
        {depth < 2 && (
          <button
            type="button"
            onClick={props.onAddGroup}
            className="text-zinc-500 hover:text-zinc-300 flex items-center gap-0.5"
          >
            <Plus className="w-3 h-3" /> nested group
          </button>
        )}
      </div>

      {props.group.conditions.map((c) => (
        <div key={c.id} className="flex flex-wrap gap-1 items-center text-xs">
          <select
            value={c.field}
            onChange={(e) =>
              props.onUpdateCondition(c.id, {
                field: e.target.value as ConditionField,
              })
            }
            className="rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5 text-zinc-200 max-w-[140px]"
          >
            {FIELDS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <select
            value={c.op}
            onChange={(e) =>
              props.onUpdateCondition(c.id, { op: e.target.value as ConditionOp })
            }
            className="rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5 text-zinc-200"
          >
            {OPS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          {c.op !== "is_true" && c.op !== "is_false" && (
            <input
              value={
                Array.isArray(c.value) ? c.value.join(",") : String(c.value ?? "")
              }
              onChange={(e) => {
                const raw = e.target.value;
                let value: StrategyCondition["value"] = raw;
                if (c.op === "in" || c.op === "not_in") {
                  value = raw
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
                } else if (c.op === "between") {
                  const parts = raw.split(",").map((s) => Number(s.trim()));
                  value =
                    parts.length >= 2
                      ? ([parts[0]!, parts[1]!] as [number, number])
                      : raw;
                } else if (
                  c.op === "gte" ||
                  c.op === "lte" ||
                  c.op === "eq"
                ) {
                  const n = Number(raw);
                  value = raw !== "" && Number.isFinite(n) && !/[a-z]/i.test(raw) ? n : raw;
                }
                props.onUpdateCondition(c.id, { value });
              }}
              className="flex-1 min-w-[80px] rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-zinc-200"
              placeholder="value"
            />
          )}
          <button
            type="button"
            onClick={() => props.onRemoveCondition(c.id)}
            className="text-zinc-600 hover:text-red-400"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      ))}

      {props.group.groups?.map((g) => (
        <GroupEditor
          key={g.id}
          group={g}
          depth={depth + 1}
          onLogic={(logic) => props.onNestedLogic(g.id, logic)}
          onAddCondition={() => props.onNestedAddCondition(g.id)}
          onAddGroup={() => props.onNestedAddGroup(g.id)}
          onUpdateCondition={props.onUpdateCondition}
          onRemoveCondition={props.onRemoveCondition}
          onNestedLogic={props.onNestedLogic}
          onNestedAddCondition={props.onNestedAddCondition}
          onNestedAddGroup={props.onNestedAddGroup}
        />
      ))}
    </div>
  );
}
