"use client";

import { useCallback, useState } from "react";
import { Button } from "../ui/button";

type SlimMatch = {
  catalystId: string;
  symbol: string;
  ingestedAt: string;
  category: string;
  implication: string;
  whyComparable: string[];
  returnM15: number | null;
  mfePct: number | null;
  maePct: number | null;
};

type HorizonRow = {
  horizon: string;
  n: number;
  medianPct: number | null;
  p25Pct: number | null;
  p75Pct: number | null;
  insufficientSample: boolean;
};

type AnaloguePayload = {
  engineVersion: string;
  disclaimer: string;
  criteriaPreset: string;
  sampleSizeIfLooser: number | null;
  sampleSizeIfTighter: number | null;
  stats: {
    sampleSize: number;
    insufficientSample: boolean;
    smallSampleLabel: string | null;
    horizons: HorizonRow[];
    medianMfePct: number | null;
    medianMaePct: number | null;
    pctRemainedAboveEventPrice: number | null;
    pctRemainedAboveEventPriceCi: { low: number; high: number } | null;
    pctFellBelowFiveMinPrice: number | null;
    medianSpreadPct: number | null;
    haltFrequency: number | null;
  };
  matches: SlimMatch[];
  methodology?: {
    version: string;
    summary: string;
    disclosures: string[];
  };
};

function pct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(1)}%`;
}

function share(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(0)}%`;
}

export function AnaloguePanel({ catalystId }: { catalystId: string }) {
  const [preset, setPreset] = useState<"tight" | "default" | "loose">("default");
  const [data, setData] = useState<AnaloguePayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (nextPreset: "tight" | "default" | "loose" = preset) => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(
          `/api/analogue?catalystId=${encodeURIComponent(catalystId)}&preset=${nextPreset}`
        );
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || "Could not load analogues");
          setData(null);
        } else {
          setData(json);
        }
      } catch {
        setError("Could not load analogues");
      } finally {
        setLoading(false);
      }
    },
    [catalystId, preset]
  );

  return (
    <div className="space-y-2" data-guide="historical-analogues">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-[--text-muted]">
          Comparison tightness
        </span>
        {(["tight", "default", "loose"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => {
              setPreset(p);
              void load(p);
            }}
            className={`rounded px-2 py-0.5 text-[10px] border ${
              preset === p
                ? "border-emerald-700 text-emerald-300 bg-emerald-950/40"
                : "border-[--border] text-[--text-muted]"
            }`}
          >
            {p}
          </button>
        ))}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-[10px]"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? "Loading…" : data ? "Refresh" : "Load analogues"}
        </Button>
      </div>

      {error && <p className="text-[11px] text-red-400">{error}</p>}

      {data && (
        <div className="space-y-2 text-[11px] text-[--text-secondary]">
          <p className="text-[--text-primary] leading-relaxed">{data.disclaimer}</p>
          {data.stats.smallSampleLabel && (
            <p className="text-amber-300/90">{data.stats.smallSampleLabel}</p>
          )}
          <p>
            Sample size: <strong>{data.stats.sampleSize}</strong>
            {data.sampleSizeIfTighter != null && (
              <> · if tighter: {data.sampleSizeIfTighter}</>
            )}
            {data.sampleSizeIfLooser != null && (
              <> · if looser: {data.sampleSizeIfLooser}</>
            )}
            <span className="text-[--text-muted]"> · {data.engineVersion}</span>
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-[10px] font-mono">
              <thead>
                <tr className="text-[--text-muted]">
                  <th className="py-1 pr-2">Horizon</th>
                  <th className="py-1 pr-2">n</th>
                  <th className="py-1 pr-2">P25</th>
                  <th className="py-1 pr-2">Median</th>
                  <th className="py-1 pr-2">P75</th>
                </tr>
              </thead>
              <tbody>
                {data.stats.horizons.map((h) => (
                  <tr key={h.horizon} className="border-t border-[--border]/40">
                    <td className="py-0.5 pr-2">{h.horizon}</td>
                    <td className="py-0.5 pr-2">
                      {h.n}
                      {h.insufficientSample ? "*" : ""}
                    </td>
                    <td className="py-0.5 pr-2">{pct(h.p25Pct)}</td>
                    <td className="py-0.5 pr-2">{pct(h.medianPct)}</td>
                    <td className="py-0.5 pr-2">{pct(h.p75Pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-0.5 text-[10px]">
            <li>
              Median MFE / MAE: {pct(data.stats.medianMfePct)} /{" "}
              {pct(data.stats.medianMaePct)}
            </li>
            <li>
              Remained above event price:{" "}
              {share(data.stats.pctRemainedAboveEventPrice)}
              {data.stats.pctRemainedAboveEventPriceCi
                ? ` (CI ${share(data.stats.pctRemainedAboveEventPriceCi.low)}–${share(data.stats.pctRemainedAboveEventPriceCi.high)})`
                : ""}
            </li>
            <li>
              Fell below 5-min price:{" "}
              {share(data.stats.pctFellBelowFiveMinPrice)}
            </li>
            <li>Median spread: {pct(data.stats.medianSpreadPct)}</li>
            <li>Halt frequency: {share(data.stats.haltFrequency)}</li>
          </ul>

          {data.matches.length > 0 && (
            <details className="rounded border border-[--border] bg-black/20">
              <summary className="cursor-pointer px-2 py-1.5 text-[10px] font-semibold">
                Why these events were comparable ({data.matches.length})
              </summary>
              <ul className="px-2 pb-2 space-y-2">
                {data.matches.slice(0, 8).map((m) => (
                  <li key={m.catalystId} className="text-[10px]">
                    <span className="font-mono text-[--text-primary]">
                      {m.symbol}
                    </span>{" "}
                    · {m.category} · {m.implication}
                    {m.returnM15 != null ? ` · 15m ${pct(m.returnM15)}` : ""}
                    <ul className="list-disc pl-4 text-[--text-muted]">
                      {m.whyComparable.slice(0, 4).map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {data.methodology && (
            <details className="text-[10px] text-[--text-muted]">
              <summary className="cursor-pointer">Methodology & version</summary>
              <p className="mt-1">{data.methodology.summary}</p>
              <ul className="list-disc pl-4 mt-1">
                {data.methodology.disclosures.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
              <p className="mt-1 font-mono">{data.methodology.version}</p>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
