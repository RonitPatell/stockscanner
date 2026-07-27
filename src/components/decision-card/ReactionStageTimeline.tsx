"use client";

import { cn } from "@/lib/utils";

export interface ReactionTimelineEvent {
  id: string;
  kind: string;
  at: string;
  label: string;
  detail?: string;
}

const KIND_COLOR: Record<string, string> = {
  publication: "bg-sky-400",
  first_ingestion: "bg-emerald-400",
  classified: "bg-violet-400",
  initial_reaction: "bg-amber-400",
  alert: "bg-rose-400",
  halt: "bg-orange-500",
  stage_change: "bg-zinc-400",
  user_delivered: "bg-teal-400",
};

/**
 * Visual timeline: publication → ingestion → reaction → alerts → halts.
 */
export function ReactionStageTimeline({
  events,
  className,
}: {
  events: ReactionTimelineEvent[];
  className?: string;
}) {
  if (!events.length) {
    return (
      <div className={cn("text-[10px] italic text-[--text-muted]", className)}>
        Timeline unavailable
      </div>
    );
  }

  const times = events.map((e) => new Date(e.at).getTime()).filter(Number.isFinite);
  const min = Math.min(...times);
  const max = Math.max(...times);
  const span = Math.max(1, max - min);

  return (
    <div className={cn("space-y-2", className)} aria-label="Reaction timeline">
      <div className="relative h-2 rounded-full bg-[--border]/40">
        {events.map((e) => {
          const t = new Date(e.at).getTime();
          if (!Number.isFinite(t)) return null;
          const left = ((t - min) / span) * 100;
          return (
            <span
              key={e.id}
              title={`${e.label} · ${e.at}`}
              className={cn(
                "absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/40",
                KIND_COLOR[e.kind] ?? "bg-zinc-300"
              )}
              style={{ left: `${left}%` }}
            />
          );
        })}
      </div>
      <ul className="space-y-1">
        {events.map((e) => (
          <li key={e.id} className="flex gap-2 text-[10px] leading-snug">
            <span
              className={cn(
                "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                KIND_COLOR[e.kind] ?? "bg-zinc-400"
              )}
            />
            <div className="min-w-0">
              <div className="text-[--text-primary]">
                <span className="font-medium">{e.label}</span>
                <span className="ml-1.5 font-mono text-[--text-muted]">
                  {formatClock(e.at)}
                </span>
              </div>
              {e.detail && (
                <div className="text-[--text-muted] truncate">{e.detail}</div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatClock(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "America/New_York",
  }) + " ET";
}
