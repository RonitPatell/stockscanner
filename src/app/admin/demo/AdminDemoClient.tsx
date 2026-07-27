"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type CaseRow = {
  id: string;
  symbol: string;
  headline: string;
  source: string;
  publishedAt: string;
  approved: boolean;
  approvedAt: string | null;
  approvedByEmail: string | null;
};

type Candidate = {
  id: string;
  symbol: string;
  headline: string;
  source: string;
  publishedAt: string;
};

export function AdminDemoClient() {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [analytics, setAnalytics] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/demo");
    if (!res.ok) {
      setError("Failed to load");
      return;
    }
    const data = (await res.json()) as {
      cases: CaseRow[];
      candidates: Candidate[];
      analytics: Record<string, number>;
    };
    setCases(data.cases);
    setCandidates(data.candidates);
    setAnalytics(data.analytics);
    setError(null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(j?.error ?? "Action failed");
      } else {
        setError(null);
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      <section>
        <h2 className="text-sm font-semibold mb-2">Demo analytics (aggregates)</h2>
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
          {Object.entries(analytics).map(([k, v]) => (
            <li
              key={k}
              className="rounded border border-zinc-800 bg-zinc-950/60 px-2 py-1.5"
            >
              <div className="text-[10px] uppercase text-zinc-500">{k}</div>
              <div className="font-mono text-emerald-300">{v}</div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Approved / draft cases</h2>
        <ul className="space-y-2">
          {cases.map((c) => (
            <li
              key={c.id}
              className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono font-semibold">{c.symbol}</span>{" "}
                  <span className="text-zinc-500">{c.source}</span>{" "}
                  <span
                    className={
                      c.approved ? "text-emerald-400 text-xs" : "text-amber-400 text-xs"
                    }
                  >
                    {c.approved ? "approved" : "draft"}
                  </span>
                  <p className="text-zinc-300 line-clamp-1">{c.headline}</p>
                </div>
                <div className="flex gap-2">
                  {!c.approved ? (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => void post({ action: "approve", id: c.id })}
                    >
                      Approve
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void post({ action: "unapprove", id: c.id })}
                    >
                      Unapprove
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void post({ action: "remove", id: c.id })}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </li>
          ))}
          {cases.length === 0 && (
            <p className="text-sm text-zinc-500">No curated cases yet.</p>
          )}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">
          Promote wire catalyst → curated draft
        </h2>
        <ul className="space-y-2">
          {candidates.map((c) => (
            <li
              key={c.id}
              className="rounded-lg border border-zinc-800 px-3 py-2 text-sm flex flex-wrap items-center justify-between gap-2"
            >
              <div>
                <span className="font-mono font-semibold">{c.symbol}</span>{" "}
                <span className="text-zinc-500">{c.source}</span>
                <p className="text-zinc-400 line-clamp-1">{c.headline}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void post({ action: "create_from_catalyst", catalystId: c.id })
                }
              >
                Add draft
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-xs text-zinc-500">
        Public demo: <Link href="/demo" className="text-emerald-400">/demo</Link>
      </p>
    </div>
  );
}
