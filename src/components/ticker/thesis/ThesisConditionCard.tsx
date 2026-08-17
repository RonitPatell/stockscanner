"use client";

import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ThesisConditionDto } from "@/lib/thesis/service";
import {
  describeCondition,
  evalStateToUserStatus,
  formatConditionValueDisplay,
  userStatusLabel,
} from "@/lib/thesis/labels";

function statusClass(status: string): string {
  switch (status) {
    case "intact":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
    case "needs_review":
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    case "manual":
      return "border-zinc-600 bg-zinc-800/60 text-zinc-300";
    default:
      return "border-zinc-700 bg-zinc-900 text-zinc-400";
  }
}

function formatChecked(iso: string | undefined): string {
  if (!iso) return "Not checked yet";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Not checked yet";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ThesisConditionCard({
  condition,
  index,
  total,
  busy,
  onEdit,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  condition: ThesisConditionDto;
  index: number;
  total: number;
  busy?: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const ev = condition.evaluation;
  const status = evalStateToUserStatus(
    ev.mode === "automated" ? ev.state : null,
    ev.mode
  );
  const description = describeCondition({
    conditionType: condition.conditionType,
    params: condition.params,
    label: condition.label,
  });
  const latest =
    ev.mode === "automated"
      ? formatConditionValueDisplay({
          conditionType: condition.conditionType,
          actualValue: ev.actualValue,
          evidenceLabel: ev.evidence?.label,
        })
      : "—";
  const sourceUrl =
    ev.mode === "automated" ? ev.evidence?.sourceUrl : undefined;
  const sourceLabel =
    ev.mode === "automated"
      ? ev.evidence?.label || "Source"
      : "Manual";
  const explanation =
    ev.mode === "manual"
      ? "Manual — TrustTicker cannot verify this automatically."
      : ev.explanation || "Waiting for the next health check.";
  const lastChecked =
    ev.mode === "automated" ? formatChecked(ev.evaluatedAt) : "—";

  return (
    <article
      className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3"
      data-testid={`thesis-condition-${condition.id}`}
      data-condition-id={condition.id}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-[13px] sm:text-sm text-zinc-100 font-medium leading-snug">
            {description}
          </p>
          <span
            className={cn(
              "inline-flex text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border",
              statusClass(status)
            )}
            data-testid="thesis-condition-status"
          >
            {userStatusLabel(status)}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            className="text-[11px] text-zinc-500 hover:text-zinc-200 px-1.5 py-1 disabled:opacity-40"
            disabled={busy || index === 0}
            onClick={onMoveUp}
            aria-label="Move condition up"
            data-testid="thesis-condition-move-up"
          >
            ↑
          </button>
          <button
            type="button"
            className="text-[11px] text-zinc-500 hover:text-zinc-200 px-1.5 py-1 disabled:opacity-40"
            disabled={busy || index >= total - 1}
            onClick={onMoveDown}
            aria-label="Move condition down"
            data-testid="thesis-condition-move-down"
          >
            ↓
          </button>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[12px]">
        <div>
          <dt className="text-[10px] text-zinc-500">Latest</dt>
          <dd className="font-mono text-zinc-200" data-testid="thesis-condition-latest">
            {latest}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] text-zinc-500">Last checked</dt>
          <dd className="text-zinc-400" data-testid="thesis-condition-checked">
            {lastChecked}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[10px] text-zinc-500">Source</dt>
          <dd className="text-zinc-400">
            {sourceUrl ? (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-emerald-400 hover:underline"
                data-testid="thesis-condition-source"
              >
                {sourceLabel}
                <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              <span data-testid="thesis-condition-source">{sourceLabel}</span>
            )}
          </dd>
        </div>
      </dl>

      <p
        className="text-[12px] text-zinc-500 leading-relaxed"
        data-testid="thesis-condition-explanation"
      >
        {explanation}
      </p>

      {ev.mode === "manual" ? (
        <p className="text-[11px] text-zinc-500 border border-zinc-800 rounded-md px-2 py-1.5 bg-zinc-950/50">
          Manual — TrustTicker cannot verify this automatically.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          className="text-[12px] px-2.5 py-1.5 rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          disabled={busy}
          onClick={onEdit}
          data-testid="thesis-condition-edit"
        >
          Edit
        </button>
        <button
          type="button"
          className="text-[12px] px-2.5 py-1.5 rounded-md border border-rose-500/30 text-rose-300/90 hover:bg-rose-500/10 disabled:opacity-50"
          disabled={busy}
          onClick={onRemove}
          data-testid="thesis-condition-remove"
        >
          Remove
        </button>
      </div>
    </article>
  );
}
