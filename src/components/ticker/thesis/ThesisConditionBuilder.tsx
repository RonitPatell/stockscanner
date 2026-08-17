"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  CAPITAL_RISK_LABELS,
  GROWTH_PERIOD_LABELS,
  THESIS_BUILDER_KIND_OPTIONS,
  THESIS_EVENT_OPTIONS,
  THESIS_METRIC_LABELS,
  type ThesisBuilderKind,
  describeCondition,
} from "@/lib/thesis/labels";
import type { ThesisConditionType, ThesisMetricKey } from "@/lib/thesis/types";
import { THESIS_METRIC_KEYS } from "@/lib/thesis/types";

export type ConditionBuilderResult = {
  conditionType: ThesisConditionType;
  label: string;
  polarity: "support_if" | "risk_if" | "invalidate_if";
  params: Record<string, unknown>;
};

const LEVEL_METRICS = THESIS_METRIC_KEYS.filter(
  (k) => k !== "cash_runway_quarters"
);
const GROWTH_METRICS: ThesisMetricKey[] = [
  "revenue",
  "gross_margin",
  "operating_margin",
  "net_income",
  "eps",
  "free_cash_flow",
  "cash",
];

function defaultResult(kind: ThesisBuilderKind): ConditionBuilderResult {
  switch (kind) {
    case "metric_level":
      return {
        conditionType: "METRIC_ABOVE",
        label: "Gross margin stays above 30",
        polarity: "support_if",
        params: { metricKey: "gross_margin", threshold: 30 },
      };
    case "metric_growth":
      return {
        conditionType: "METRIC_GROWTH_ABOVE",
        label: "Revenue growth stays above 25% year over year",
        polarity: "support_if",
        params: {
          metricKey: "revenue",
          thresholdPercent: 25,
          period: "yoy",
        },
      };
    case "share_growth":
      return {
        conditionType: "SHARE_COUNT_CHANGE_BELOW",
        label: "Share count growth stays below 10% year over year",
        polarity: "support_if",
        params: { thresholdPercent: 10, period: "yoy" },
      };
    case "event":
      return {
        conditionType: "NO_EVENT_TYPE",
        label: "New ATM financing does not occur",
        polarity: "invalidate_if",
        params: { eventType: "atm_program" },
      };
    case "capital_risk":
      return {
        conditionType: "CAPITAL_RISK_NOT_ABOVE",
        label: "Capital risk stays at or below Moderate",
        polarity: "support_if",
        params: { maxStatus: "moderate" },
      };
    case "cash_runway":
      return {
        conditionType: "CASH_RUNWAY_ABOVE",
        label: "Cash runway stays above 4 quarters",
        polarity: "support_if",
        params: { quarters: 4 },
      };
    case "manual":
      return {
        conditionType: "CUSTOM_MANUAL",
        label: "Manual note",
        polarity: "support_if",
        params: { text: "" },
      };
  }
}

function kindFromConditionType(t: string): ThesisBuilderKind {
  if (t === "METRIC_ABOVE" || t === "METRIC_BELOW") return "metric_level";
  if (t === "METRIC_GROWTH_ABOVE" || t === "METRIC_GROWTH_BELOW")
    return "metric_growth";
  if (t === "SHARE_COUNT_CHANGE_BELOW") return "share_growth";
  if (t === "NO_EVENT_TYPE" || t === "EVENT_TYPE_OCCURRED") return "event";
  if (t === "CAPITAL_RISK_NOT_ABOVE") return "capital_risk";
  if (t === "CASH_RUNWAY_ABOVE") return "cash_runway";
  return "manual";
}

const fieldClass =
  "w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-[13px] text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40";
const labelClass = "block text-[11px] text-zinc-500 mb-1";

export function ThesisConditionBuilder({
  initial,
  submitLabel = "Add condition",
  onSubmit,
  onCancel,
  busy,
}: {
  initial?: ConditionBuilderResult | null;
  submitLabel?: string;
  onSubmit: (result: ConditionBuilderResult) => void | Promise<void>;
  onCancel: () => void;
  busy?: boolean;
}) {
  const [kind, setKind] = useState<ThesisBuilderKind>(
    initial ? kindFromConditionType(initial.conditionType) : "metric_growth"
  );
  const [metricKey, setMetricKey] = useState<string>(
    String(initial?.params.metricKey ?? "revenue")
  );
  const [levelRule, setLevelRule] = useState<"above" | "below">(
    initial?.conditionType === "METRIC_BELOW" ||
      initial?.conditionType === "METRIC_GROWTH_BELOW"
      ? "below"
      : "above"
  );
  const [threshold, setThreshold] = useState<string>(
    String(
      initial?.params.threshold ??
        initial?.params.thresholdPercent ??
        initial?.params.quarters ??
        25
    )
  );
  const [period, setPeriod] = useState<"yoy" | "qoq">(
    initial?.params.period === "qoq" ? "qoq" : "yoy"
  );
  const [eventType, setEventType] = useState<string>(
    String(initial?.params.eventType ?? "atm_program")
  );
  const [eventRule, setEventRule] = useState<"does_not_occur" | "does_occur">(
    initial?.conditionType === "EVENT_TYPE_OCCURRED"
      ? "does_occur"
      : "does_not_occur"
  );
  const [maxStatus, setMaxStatus] = useState<string>(
    String(initial?.params.maxStatus ?? "moderate")
  );
  const [manualText, setManualText] = useState<string>(
    String(initial?.params.text ?? "")
  );
  const [error, setError] = useState<string | null>(null);

  let preview = "";
  try {
    preview = describeCondition(buildResult());
  } catch {
    preview = "";
  }

  function buildResult(): ConditionBuilderResult {
    const n = Number(threshold);
    if (kind === "metric_level") {
      if (!Number.isFinite(n)) throw new Error("Enter a valid threshold");
      const conditionType: ThesisConditionType =
        levelRule === "above" ? "METRIC_ABOVE" : "METRIC_BELOW";
      const params = { metricKey, threshold: n };
      return {
        conditionType,
        polarity: "support_if",
        params,
        label: describeCondition({ conditionType, params }),
      };
    }
    if (kind === "metric_growth") {
      if (!Number.isFinite(n)) throw new Error("Enter a valid threshold");
      const conditionType: ThesisConditionType =
        levelRule === "above" ? "METRIC_GROWTH_ABOVE" : "METRIC_GROWTH_BELOW";
      const params = {
        metricKey,
        thresholdPercent: n,
        period,
      };
      return {
        conditionType,
        polarity: "support_if",
        params,
        label: describeCondition({ conditionType, params }),
      };
    }
    if (kind === "share_growth") {
      if (!Number.isFinite(n) || n <= 0)
        throw new Error("Enter a positive percent threshold");
      const conditionType: ThesisConditionType = "SHARE_COUNT_CHANGE_BELOW";
      const params = { thresholdPercent: n, period };
      return {
        conditionType,
        polarity: "support_if",
        params,
        label: describeCondition({ conditionType, params }),
      };
    }
    if (kind === "event") {
      const conditionType: ThesisConditionType =
        eventRule === "does_occur" ? "EVENT_TYPE_OCCURRED" : "NO_EVENT_TYPE";
      const params = { eventType };
      return {
        conditionType,
        polarity:
          eventRule === "does_not_occur" ? "invalidate_if" : "support_if",
        params,
        label: describeCondition({ conditionType, params }),
      };
    }
    if (kind === "capital_risk") {
      const conditionType: ThesisConditionType = "CAPITAL_RISK_NOT_ABOVE";
      const params = { maxStatus };
      return {
        conditionType,
        polarity: "support_if",
        params,
        label: describeCondition({ conditionType, params }),
      };
    }
    if (kind === "cash_runway") {
      if (!Number.isFinite(n) || n <= 0)
        throw new Error("Enter a positive number of quarters");
      const conditionType: ThesisConditionType = "CASH_RUNWAY_ABOVE";
      const params = { quarters: n };
      return {
        conditionType,
        polarity: "support_if",
        params,
        label: describeCondition({ conditionType, params }),
      };
    }
    const text = manualText.trim();
    if (!text) throw new Error("Write a short note for this manual condition");
    const conditionType: ThesisConditionType = "CUSTOM_MANUAL";
    const params = { text };
    return {
      conditionType,
      polarity: "support_if",
      params,
      label: text.slice(0, 200),
    };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const result = buildResult();
      await onSubmit(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save condition");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-zinc-700 bg-zinc-900/50 p-4 space-y-4"
      data-testid="thesis-condition-builder"
    >
      <div>
        <label className={labelClass} htmlFor="thesis-kind">
          Condition type
        </label>
        <select
          id="thesis-kind"
          className={fieldClass}
          value={kind}
          onChange={(e) => {
            const next = e.target.value as ThesisBuilderKind;
            setKind(next);
            const d = defaultResult(next);
            setMetricKey(String(d.params.metricKey ?? metricKey));
            setThreshold(
              String(
                d.params.threshold ??
                  d.params.thresholdPercent ??
                  d.params.quarters ??
                  threshold
              )
            );
            setError(null);
          }}
          data-testid="thesis-builder-kind"
        >
          {THESIS_BUILDER_KIND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-zinc-600 mt-1">
          {THESIS_BUILDER_KIND_OPTIONS.find((o) => o.value === kind)?.hint}
        </p>
      </div>

      {(kind === "metric_level" || kind === "metric_growth") && (
        <div>
          <label className={labelClass} htmlFor="thesis-metric">
            Metric
          </label>
          <select
            id="thesis-metric"
            className={fieldClass}
            value={metricKey}
            onChange={(e) => setMetricKey(e.target.value)}
            data-testid="thesis-builder-metric"
          >
            {(kind === "metric_growth" ? GROWTH_METRICS : LEVEL_METRICS).map(
              (k) => (
                <option key={k} value={k}>
                  {kind === "metric_growth"
                    ? `${THESIS_METRIC_LABELS[k]} growth`
                    : THESIS_METRIC_LABELS[k]}
                </option>
              )
            )}
          </select>
        </div>
      )}

      {(kind === "metric_level" ||
        kind === "metric_growth" ||
        kind === "share_growth" ||
        kind === "cash_runway") && (
        <div>
          <label className={labelClass} htmlFor="thesis-rule">
            Rule
          </label>
          {kind === "share_growth" || kind === "cash_runway" ? (
            <p
              className="text-[13px] text-zinc-300"
              data-testid="thesis-builder-rule-fixed"
            >
              {kind === "share_growth" ? "Stays below" : "Stays above"}
            </p>
          ) : (
            <select
              id="thesis-rule"
              className={fieldClass}
              value={levelRule}
              onChange={(e) =>
                setLevelRule(e.target.value as "above" | "below")
              }
              data-testid="thesis-builder-rule"
            >
              <option value="above">Stays above</option>
              <option value="below">Stays below</option>
            </select>
          )}
        </div>
      )}

      {(kind === "metric_level" ||
        kind === "metric_growth" ||
        kind === "share_growth" ||
        kind === "cash_runway") && (
        <div>
          <label className={labelClass} htmlFor="thesis-threshold">
            Threshold
            {kind === "metric_growth" || kind === "share_growth"
              ? " (%)"
              : kind === "cash_runway"
                ? " (quarters)"
                : ""}
          </label>
          <input
            id="thesis-threshold"
            type="number"
            step="any"
            className={fieldClass}
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            data-testid="thesis-builder-threshold"
          />
        </div>
      )}

      {(kind === "metric_growth" || kind === "share_growth") && (
        <div>
          <label className={labelClass} htmlFor="thesis-period">
            Comparison
          </label>
          <select
            id="thesis-period"
            className={fieldClass}
            value={period}
            onChange={(e) => setPeriod(e.target.value as "yoy" | "qoq")}
            data-testid="thesis-builder-period"
          >
            <option value="yoy">{GROWTH_PERIOD_LABELS.yoy}</option>
            <option value="qoq">{GROWTH_PERIOD_LABELS.qoq}</option>
          </select>
        </div>
      )}

      {kind === "event" && (
        <>
          <div>
            <label className={labelClass} htmlFor="thesis-event">
              Event
            </label>
            <select
              id="thesis-event"
              className={fieldClass}
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              data-testid="thesis-builder-event"
            >
              {THESIS_EVENT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="thesis-event-rule">
              Rule
            </label>
            <select
              id="thesis-event-rule"
              className={fieldClass}
              value={eventRule}
              onChange={(e) =>
                setEventRule(e.target.value as "does_not_occur" | "does_occur")
              }
              data-testid="thesis-builder-event-rule"
            >
              <option value="does_not_occur">Does not occur</option>
              <option value="does_occur">Does occur</option>
            </select>
          </div>
        </>
      )}

      {kind === "capital_risk" && (
        <div>
          <label className={labelClass} htmlFor="thesis-capital-max">
            Never above
          </label>
          <select
            id="thesis-capital-max"
            className={fieldClass}
            value={maxStatus}
            onChange={(e) => setMaxStatus(e.target.value)}
            data-testid="thesis-builder-capital-max"
          >
            {(["low", "moderate", "elevated"] as const).map((s) => (
              <option key={s} value={s}>
                {CAPITAL_RISK_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      )}

      {kind === "manual" && (
        <div>
          <label className={labelClass} htmlFor="thesis-manual">
            Your note
          </label>
          <textarea
            id="thesis-manual"
            className={fieldClass + " min-h-[88px]"}
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder="e.g. Management stays focused on enterprise customers"
            data-testid="thesis-builder-manual"
          />
          <p className="text-[11px] text-zinc-600 mt-1">
            Manual — TrustTicker cannot verify this automatically.
          </p>
        </div>
      )}

      {preview ? (
        <p className="text-[12px] text-zinc-400 border border-zinc-800 rounded-md px-3 py-2 bg-zinc-950/40">
          Preview: <span className="text-zinc-200">{preview}</span>
        </p>
      ) : null}

      {error ? (
        <p className="text-[12px] text-rose-300" data-testid="thesis-builder-error">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={busy}
          data-testid="thesis-builder-submit"
        >
          {submitLabel}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={onCancel}
          data-testid="thesis-builder-cancel"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
