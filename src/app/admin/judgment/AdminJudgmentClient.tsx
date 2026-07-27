"use client";

import { useEffect, useState } from "react";

type ReviewItem = {
  id: string;
  catalystId: string;
  symbol: string;
  headline: string;
  priorityScore: number;
  reportCount: number;
  confidence: string | null;
  catalystStrength: string | null;
  grade: string | null;
  judgmentVersion: string | null;
  status: string;
  adminNote: string | null;
};

export function AdminJudgmentClient() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [feedbackByAction, setFeedbackByAction] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const load = () => {
    void fetch("/api/admin/judgment?status=open")
      .then(async (r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then((d) => {
        setItems(d.items ?? []);
        setFeedbackByAction(d.feedbackByAction ?? {});
        setNote(d.note ?? "");
        setError("");
      })
      .catch((e) => setError(String(e.message || e)));
  };

  useEffect(() => {
    load();
  }, []);

  const setStatus = async (id: string, status: string) => {
    await fetch("/api/admin/judgment", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    load();
  };

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-400">{error}</p>}
      {note && <p className="text-sm text-zinc-400">{note}</p>}

      <section>
        <h2 className="text-sm font-semibold text-zinc-300 mb-2">Feedback totals</h2>
        <div className="flex flex-wrap gap-2">
          {Object.keys(feedbackByAction).length === 0 && (
            <p className="text-xs text-zinc-600">No feedback yet</p>
          )}
          {Object.entries(feedbackByAction).map(([k, n]) => (
            <span key={k} className="text-xs px-2 py-1 rounded border border-zinc-700">
              {k}: {n}
            </span>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-zinc-300 mb-3">
          Open queue ({items.length})
        </h2>
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-2"
            >
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono font-semibold">{item.symbol}</span>
                <span className="text-zinc-500 text-xs">priority {item.priorityScore}</span>
                <span className="text-zinc-500 text-xs">reports {item.reportCount}</span>
                {item.grade && (
                  <span className="text-xs uppercase text-zinc-300">{item.grade}</span>
                )}
                {item.confidence && (
                  <span className="text-xs text-amber-300">{item.confidence} conf</span>
                )}
                {item.catalystStrength && (
                  <span className="text-xs text-zinc-400">{item.catalystStrength}</span>
                )}
              </div>
              <p className="text-sm text-zinc-200">{item.headline}</p>
              <p className="text-[11px] text-zinc-500 font-mono">
                {item.judgmentVersion} · {item.catalystId}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="text-xs px-2 py-1 rounded border border-zinc-600 hover:border-emerald-500/50"
                  onClick={() => void setStatus(item.id, "reviewed")}
                >
                  Mark reviewed
                </button>
                <button
                  type="button"
                  className="text-xs px-2 py-1 rounded border border-zinc-600 hover:border-zinc-400"
                  onClick={() => void setStatus(item.id, "dismissed")}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-sm text-zinc-600">Queue empty</p>
          )}
        </div>
      </section>
    </div>
  );
}
