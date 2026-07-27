"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ChevronDown,
  ExternalLink,
  Flag,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatPercent, formatPrice } from "@/lib/utils";
import type { PublicDemoPayload, PublicDemoRecord } from "@/lib/demo/types";

function track(event: string) {
  void fetch("/api/demo/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event }),
  }).catch(() => {});
}

function EvidenceCard({
  record,
  expanded,
  onToggle,
  onSourceClick,
}: {
  record: PublicDemoRecord;
  expanded: boolean;
  onToggle: () => void;
  onSourceClick: () => void;
}) {
  const panelId = useId();
  const btnId = useId();

  return (
    <article
      className={cn(
        "rounded-lg border bg-zinc-950/60 overflow-hidden",
        expanded ? "border-emerald-500/35" : "border-zinc-800"
      )}
    >
      <button
        type="button"
        id={btnId}
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
        className="w-full text-left px-3 py-2.5 flex items-start gap-3 hover:bg-zinc-900/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-zinc-100">
              {record.symbol}
            </span>
            <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
              {record.category}
            </span>
            <span className="text-[10px] text-zinc-500">{record.source}</span>
            {record.textRedacted && (
              <span className="text-[10px] text-amber-400/90 flex items-center gap-0.5">
                <ShieldAlert className="w-3 h-3" /> Text redacted
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-zinc-200 line-clamp-2">{record.headline}</p>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-zinc-500">
            <span>Event: {record.eventDateLabel}</span>
            <span>
              Published{" "}
              {new Date(record.publishedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span>
              Ingested{" "}
              {new Date(record.ingestedAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {record.changePercentAtIngest != null && (
              <span
                className={cn(
                  "font-mono",
                  record.changePercentAtIngest >= 0
                    ? "text-emerald-400"
                    : "text-red-400"
                )}
              >
                {formatPercent(record.changePercentAtIngest)}
                {record.priceAtIngest != null
                  ? ` @ ${formatPrice(record.priceAtIngest)}`
                  : ""}
              </span>
            )}
          </div>
        </div>
        <ChevronDown
          className={cn(
            "w-4 h-4 shrink-0 text-zinc-500 transition-transform mt-1",
            expanded && "rotate-180"
          )}
          aria-hidden
        />
      </button>

      <div
        id={panelId}
        role="region"
        aria-labelledby={btnId}
        hidden={!expanded}
        className="border-t border-zinc-800 px-3 py-3 space-y-3"
      >
        <ol className="space-y-2 text-sm">
          {(
            [
              ["What happened", record.guided.whatHappened],
              ["Why it mattered", record.guided.whyItMattered],
              ["What could make it a trap", record.guided.trapRisks],
              ["How the stock reacted", record.guided.howItReacted],
            ] as const
          ).map(([title, body], i) => (
            <li key={title} className="rounded-md bg-zinc-900/50 px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-wide text-emerald-400/90 mb-0.5">
                {i + 1}. {title}
              </div>
              <p className="text-zinc-300 text-[13px] leading-relaxed">{body}</p>
            </li>
          ))}
        </ol>

        <div>
          <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">
            Evidence
          </div>
          <ul className="text-[12px] text-zinc-400 space-y-0.5 list-disc pl-4">
            {record.evidence.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1 flex items-center gap-1">
            <Flag className="w-3 h-3" /> Risk flags
          </div>
          <ul className="flex flex-wrap gap-1.5">
            {record.riskFlags.map((f) => (
              <li
                key={f}
                className="text-[11px] px-1.5 py-0.5 rounded border border-amber-500/25 bg-amber-500/10 text-amber-200/90"
              >
                {f}
              </li>
            ))}
          </ul>
        </div>

        {record.priceCheckpoints.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-zinc-500 mb-1">
              Price checkpoints
            </div>
            <ul className="text-[12px] text-zinc-300 space-y-0.5">
              <li>
                At ingest:{" "}
                {record.priceAtIngest != null
                  ? formatPrice(record.priceAtIngest)
                  : "—"}{" "}
                (
                {record.changePercentAtIngest != null
                  ? formatPercent(record.changePercentAtIngest)
                  : "—"}
                )
              </li>
              {record.priceCheckpoints.map((cp) => (
                <li key={cp.label}>
                  {cp.label}:{" "}
                  {cp.price != null ? formatPrice(cp.price) : "—"}{" "}
                  {cp.changePercent != null
                    ? `(${formatPercent(cp.changePercent)})`
                    : ""}
                </li>
              ))}
            </ul>
          </div>
        )}

        {record.sourceUrl && (
          <a
            href={record.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onSourceClick}
            className="inline-flex items-center gap-1.5 text-sm text-emerald-400 hover:text-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 rounded"
          >
            Open original source <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </article>
  );
}

export function EvidenceDemo({
  initial,
}: {
  initial: PublicDemoPayload;
}) {
  const [payload, setPayload] = useState(initial);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showCta, setShowCta] = useState(false);
  const openedRef = useRef(false);
  const replayDone = useRef(false);

  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    track("demo_opened");
  }, []);

  useEffect(() => {
    if (
      payload.mode === "HISTORICAL_REPLAY" &&
      expanded.size >= Math.min(2, payload.records.length) &&
      !replayDone.current
    ) {
      replayDone.current = true;
      track("replay_completed");
    }
  }, [expanded, payload.mode, payload.records.length]);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        next.add(id);
        track("catalyst_expanded");
        if (next.size >= 2) setShowCta(true);
      }
      return next;
    });
  }, []);

  const switchMode = async (mode: string) => {
    const res = await fetch(`/api/demo?mode=${mode}`);
    if (!res.ok) return;
    const data = (await res.json()) as PublicDemoPayload;
    setPayload(data);
    setExpanded(new Set());
    setShowCta(false);
    replayDone.current = false;
  };

  return (
    <div className="flex flex-col h-full min-h-0 gap-3">
      <div
        className="shrink-0 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2.5"
        role="status"
      >
        <p className="text-xs font-semibold text-sky-100">
          Demo mode: {payload.modeLabel}
          {payload.delayMinutes != null
            ? ` · ${payload.delayMinutes}m delay`
            : ""}
          {payload.sessionDate ? ` · session ${payload.sessionDate}` : ""}
        </p>
        <p className="text-[11px] text-sky-100/75 mt-0.5 leading-relaxed">
          {payload.disclaimer}
        </p>
        <div
          className="mt-2 flex flex-wrap gap-1.5"
          role="tablist"
          aria-label="Demo mode"
        >
          {(
            [
              ["DELAYED_REAL", "Delayed real"],
              ["HISTORICAL_REPLAY", "Historical replay"],
              ["CURATED_CASES", "Curated cases"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={payload.mode === id}
              onClick={() => void switchMode(id)}
              className={cn(
                "text-[11px] px-2 py-1 rounded border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500",
                payload.mode === id
                  ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-200"
                  : "border-zinc-700 text-zinc-400 hover:text-zinc-200"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-0.5">
        {payload.records.length === 0 ? (
          <p className="text-sm text-zinc-500 px-1">
            No approved evidence rows yet for this mode. Admins can curate cases,
            or wait for delayed wire catalysts to land.
          </p>
        ) : (
          payload.records.map((r) => (
            <EvidenceCard
              key={r.id}
              record={r}
              expanded={expanded.has(r.id)}
              onToggle={() => toggle(r.id)}
              onSourceClick={() => track("source_clicked")}
            />
          ))
        )}
      </div>

      {showCta && (
        <div
          className="shrink-0 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
          role="complementary"
          aria-label="Start trial"
        >
          <div>
            <p className="text-sm font-medium text-emerald-100">
              Ready for the live Pro desk?
            </p>
            <p className="text-[11px] text-emerald-100/70">
              Real-time feed, alerts, and Prop Desk — not delayed demo rows.
            </p>
          </div>
          <Link
            href="/pricing"
            onClick={() => track("trial_cta_clicked")}
            className="shrink-0"
          >
            <Button size="sm" className="w-full sm:w-auto">
              Start Free Trial <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
