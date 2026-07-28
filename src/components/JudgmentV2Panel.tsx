"use client";

import { useMemo, useState } from "react";
import type { CatalystItem } from "@/types";
import { buildJudgmentV2 } from "@/lib/judgment/build-v2";
import {
  JUDGMENT_FEEDBACK_ACTIONS,
  JUDGMENT_FEEDBACK_LABELS,
  isJudgmentV2Enabled,
  type JudgmentFeedbackAction,
  type JudgmentV2,
} from "@/lib/judgment/types";
import { cn } from "@/lib/utils";

function AxisChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg" | "warn" | "neutral";
}) {
  const cls =
    tone === "pos"
      ? "border-emerald-500/40 text-emerald-300"
      : tone === "neg"
        ? "border-red-500/40 text-red-300"
        : tone === "warn"
          ? "border-amber-500/40 text-amber-200"
          : "border-zinc-600 text-zinc-300";
  return (
    <span className={cn("text-[10px] px-1.5 py-0.5 rounded border", cls)}>
      <span className="opacity-60">{label}: </span>
      {value}
    </span>
  );
}

export function JudgmentV2Panel({ catalyst }: { catalyst: CatalystItem }) {
  const enabled = useMemo(() => {
    // Client: NEXT_PUBLIC_JUDGMENT_V2_ENABLED or server-persisted snapshot
    if (catalyst.judgmentV2) return true;
    if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_JUDGMENT_V2_ENABLED) {
      const v = process.env.NEXT_PUBLIC_JUDGMENT_V2_ENABLED.toLowerCase();
      return v === "1" || v === "true" || v === "on";
    }
    return isJudgmentV2Enabled();
  }, [catalyst.judgmentV2]);

  const judgment: JudgmentV2 | null = useMemo(() => {
    if (!enabled) return null;
    if (catalyst.judgmentV2?.version?.startsWith("judgment-v2")) return catalyst.judgmentV2;
    return buildJudgmentV2(catalyst);
  }, [enabled, catalyst]);

  const [feedbackSent, setFeedbackSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!enabled || !judgment) return null;

  const sendFeedback = async (action: JudgmentFeedbackAction) => {
    setBusy(true);
    try {
      const res = await fetch("/api/judgment/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          catalystId: catalyst.id,
          action,
          judgmentVersion: judgment.version,
        }),
      });
      if (res.ok) setFeedbackSent(action);
    } finally {
      setBusy(false);
    }
  };

  const dirTone =
    judgment.directionalImplication === "POSITIVE"
      ? "pos"
      : judgment.directionalImplication === "NEGATIVE"
        ? "neg"
        : judgment.directionalImplication === "MIXED"
          ? "warn"
          : "neutral";

  return (
    <div
      className="rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-3 py-3 space-y-3"
      data-guide="judgment-v2"
    >
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
            Judgment V2 · {judgment.version}
          </p>
          <p className="text-[11px] text-zinc-400 mt-0.5">{judgment.disclaimer}</p>
        </div>
        {catalyst.sourceUrl && (
          <a
            href={catalyst.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-emerald-400 hover:underline"
          >
            Open source evidence →
          </a>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <AxisChip
          label="Materiality"
          value={
            judgment.catalystStrength === "STRONG"
              ? "High"
              : judgment.catalystStrength === "MODERATE"
                ? "Medium"
                : judgment.catalystStrength === "WEAK"
                  ? "Low"
                  : "Not material"
          }
        />
        <AxisChip
          label="Direction"
          value={
            judgment.directionalImplication === "POSITIVE"
              ? "Positive"
              : judgment.directionalImplication === "NEGATIVE"
                ? "Negative"
                : judgment.directionalImplication === "MIXED"
                  ? "Mixed"
                  : "Unclear"
          }
          tone={dirTone}
        />
        <AxisChip
          label="Reaction"
          value={
            judgment.timing === "STALE"
              ? "Stale"
              : judgment.timing === "SCHEDULED"
                ? "Early"
                : judgment.timing === "IMMEDIATE" || judgment.timing === "TODAY"
                  ? "Active"
                  : "Unknown"
          }
          tone={judgment.timing === "STALE" ? "warn" : "neutral"}
        />
        <AxisChip
          label="Tradeability"
          value={
            judgment.tradeability === "EXTREMELY_THIN"
              ? "Extremely thin"
              : judgment.tradeability === "THIN"
                ? "Thin"
                : judgment.tradeability === "LIQUID"
                  ? "Liquid"
                  : judgment.tradeability === "ACCEPTABLE"
                    ? "Acceptable"
                    : "Unknown"
          }
          tone={
            judgment.tradeability === "EXTREMELY_THIN" || judgment.tradeability === "THIN"
              ? "warn"
              : "neutral"
          }
        />
        <AxisChip label="Confidence" value={judgment.confidence} />
      </div>
      <p className="text-[10px] text-zinc-500">
        Materiality is whether the event warrants attention. Direction is catalyst
        implication only — not a buy or sell instruction.
      </p>

      {judgment.changeLog.length > 0 && (
        <div className="text-[11px] text-amber-200/90 border border-amber-500/20 rounded-lg px-2 py-1.5">
          <p className="font-semibold mb-1">Classification changed</p>
          {judgment.changeLog.slice(-3).map((c, i) => (
            <p key={`${c.at}-${i}`}>
              {new Date(c.at).toLocaleString()} — {c.reason}
              {c.previousGrade ? ` (prior review class ${c.previousGrade})` : ""}
            </p>
          ))}
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-2">
        <Section title="Verified facts" items={judgment.verifiedFacts} />
        <Section
          title="Automated interpretation"
          items={judgment.automatedInterpretation}
          muted
        />
        <Section title="Missing / uncertain" items={judgment.missingOrUncertain} warn />
      </div>

      {judgment.riskFlags.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Risk flags</p>
          <ul className="space-y-1">
            {judgment.riskFlags.map((r) => (
              <li key={r.id} className="text-[11px] text-amber-200/90">
                <span className="font-semibold">{r.label}</span> — {r.detail}
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="text-[11px] text-zinc-400">
        <summary className="cursor-pointer text-zinc-300">Score contributions (audit)</summary>
        <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto">
          {judgment.scoreContributions.map((s) => (
            <li key={s.id} className="flex gap-2">
              <span className="font-mono w-8 shrink-0 text-right">
                {s.points > 0 ? `+${s.points}` : s.points}
              </span>
              <span>
                <span className="text-zinc-200">{s.label}</span>
                <span className="opacity-60"> · {s.category} · {s.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </details>

      <p className="text-[11px] text-zinc-500">{judgment.gradeRationale}</p>

      <div>
        <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">
          Feedback (calibration only — does not auto-change rules)
        </p>
        <div className="flex flex-wrap gap-1.5">
          {JUDGMENT_FEEDBACK_ACTIONS.map((action) => (
            <button
              key={action}
              type="button"
              disabled={busy}
              onClick={() => void sendFeedback(action)}
              className={cn(
                "text-[10px] px-2 py-1 rounded border transition-colors",
                feedbackSent === action
                  ? "border-emerald-500/50 text-emerald-300 bg-emerald-500/10"
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
              )}
            >
              {JUDGMENT_FEEDBACK_LABELS[action]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  items,
  muted,
  warn,
}: {
  title: string;
  items: string[];
  muted?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-2.5 py-2",
        warn ? "border-amber-500/25 bg-amber-500/5" : "border-zinc-800 bg-black/20"
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider opacity-60 mb-1">{title}</p>
      {items.length === 0 ? (
        <p className="text-[11px] text-zinc-600">None listed</p>
      ) : (
        <ul className="space-y-1">
          {items.slice(0, 6).map((item) => (
            <li
              key={item.slice(0, 40)}
              className={cn("text-[11px] leading-snug", muted && "opacity-80")}
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
