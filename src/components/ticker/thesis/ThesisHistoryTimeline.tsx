"use client";

import { useEffect, useState } from "react";
import type { ThesisHistoryDto } from "@/lib/thesis/history";

export function ThesisHistoryTimeline({ thesisId }: { thesisId: string }) {
  const [history, setHistory] = useState<ThesisHistoryDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/thesis/${encodeURIComponent(thesisId)}/history`, {
          credentials: "include",
        });
        if (!res.ok) {
          if (!cancelled) setError("Could not load thesis history.");
          return;
        }
        const data = (await res.json()) as { history?: ThesisHistoryDto };
        if (!cancelled) setHistory(data.history ?? null);
      } catch {
        if (!cancelled) setError("Could not load thesis history.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [thesisId]);

  if (error) {
    return <p className="text-[12px] text-zinc-500">{error}</p>;
  }
  if (!history) {
    return <p className="text-[12px] text-zinc-500">Loading history…</p>;
  }

  const evalItems = history.evaluations.flatMap((ev) =>
    ev.conditions
      .filter((c) => c.mode === "automated" && c.state)
      .map((c) => ({
        at: ev.evaluatedAt,
        label: c.label ?? c.conditionId,
        state: c.state,
        actual: c.actualValue,
        threshold: c.threshold,
      }))
  );

  const meaningfulRevs = history.revisions.filter(
    (r) => r.kind !== "created" || history.revisions.length === 1
  );

  if (meaningfulRevs.length === 0 && evalItems.length === 0) {
    return (
      <p className="text-[12px] text-zinc-500">
        History starts when you edit conditions or an evaluation runs.
      </p>
    );
  }

  return (
    <div className="space-y-3" data-testid="thesis-history-timeline">
      {evalItems.length > 0 ? (
        <ol className="space-y-1.5">
          {evalItems.slice(-12).map((item, i) => (
            <li
              key={`${item.at}-${item.label}-${i}`}
              className="text-[12px] text-zinc-300"
            >
              <span className="text-zinc-500 font-mono mr-2">
                {item.at.slice(0, 10)}
              </span>
              <span>{item.label}</span>
              <span className="ml-2 text-zinc-400">{item.state}</span>
              {item.actual != null ? (
                <span className="ml-1 text-zinc-500">
                  {item.actual}
                  {item.threshold != null ? ` vs ${item.threshold}` : ""}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      {meaningfulRevs.length > 0 ? (
        <ol className="space-y-1 border-t border-zinc-800 pt-2">
          {meaningfulRevs.slice(-8).map((r) => (
            <li key={r.id} className="text-[11px] text-zinc-500">
              {r.createdAt.slice(0, 10)} · {r.summary}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
