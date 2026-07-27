"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type Dash = {
  indicators: Array<{
    id: string;
    name: string;
    status: string;
    measured: number | null;
    target: number;
    sampleSize: number;
    achieved: boolean;
    definition: string;
    note: string;
    unit: string;
  }>;
  sourceNotices: Array<{ source: string; message: string; status: string }>;
  live: { label: string; sampleSizes: Record<string, number> };
  publicLatency: {
    sampleSize: number;
    note: string;
    processing: { p50Ms: number | null; p90Ms: number | null };
    upstream: { p50Ms: number | null; p90Ms: number | null };
  };
  incidents: Array<{
    id: string;
    title: string;
    severity: string;
    status: string;
    startedAt: string;
    endedAt: string | null;
  }>;
  affectedSubscriberCount: number;
  disclaimer: string;
  legalPlaceholder: string;
};

export function AdminReliabilityClient() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [report, setReport] = useState<unknown>(null);
  const [preview, setPreview] = useState<unknown>(null);
  const [message, setMessage] = useState("");
  const [incidentIds, setIncidentIds] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [evalId, setEvalId] = useState("");

  const load = useCallback(() => {
    void fetch("/api/admin/reliability?view=dashboard&hours=24")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setDash(d))
      .catch(() => setMessage("Failed to load dashboard"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const loadReport = () => {
    const month = new Date().toISOString().slice(0, 7);
    void fetch(`/api/admin/reliability?view=report&month=${month}`)
      .then((r) => r.json())
      .then(setReport)
      .catch(() => setMessage("Report failed"));
  };

  const previewCredits = async () => {
    const ids = incidentIds
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const res = await fetch("/api/admin/reliability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "preview_credits",
        incidentIds: ids,
        billingPeriodStart: periodStart,
        billingPeriodEnd: periodEnd,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "Preview failed");
      return;
    }
    setPreview(data.preview);
    setEvalId(data.preview.evaluationId);
    setMessage(
      `Preview ready: $${((data.preview.totalProposedCents ?? 0) / 100).toFixed(2)} proposed (not trading-loss reimbursement).`
    );
  };

  const applyCredits = async () => {
    if (
      !window.confirm(
        "Apply Stripe subscription credits from the preview? This is not reimbursement for trading losses."
      )
    ) {
      return;
    }
    const res = await fetch("/api/admin/reliability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "apply_credits",
        evaluationId: evalId,
        confirm: "APPLY_SERVICE_CREDITS",
      }),
    });
    const data = await res.json();
    setMessage(
      res.ok
        ? `Applied ${data.applied}, skipped ${data.skipped}. ${data.disclaimer}`
        : data.error ?? "Apply failed"
    );
  };

  const createIncident = async () => {
    const res = await fetch("/api/admin/reliability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_incident",
        title: "Manual incident",
        summary: "Created from ops dashboard",
        severity: "major",
        startedAt: new Date().toISOString(),
        components: ["feed_availability_market_hours"],
        evidence: [
          {
            capturedAt: new Date().toISOString(),
            kind: "ops_note",
            payload: { note: "Initial evidence placeholder" },
          },
        ],
      }),
    });
    const data = await res.json();
    setMessage(res.ok ? `Incident ${data.incident.id} created` : data.error);
    load();
  };

  return (
    <div className="space-y-6 text-sm text-zinc-300">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={load}>
          Refresh
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={loadReport}>
          Monthly report
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => void createIncident()}>
          Create incident stub
        </Button>
        <Link href="/status" className="text-xs text-emerald-400 self-center">
          Public status →
        </Link>
      </div>

      {dash?.live && (
        <p>
          Live: {dash.live.label} · Affected subscribers (active/grace):{" "}
          {dash.affectedSubscriberCount}
        </p>
      )}

      {dash?.publicLatency && (
        <section className="rounded border border-zinc-800 p-3 space-y-1">
          <h2 className="font-semibold text-zinc-100">Latency split</h2>
          <p className="text-[11px] text-zinc-500">{dash.publicLatency.note}</p>
          <p>
            Processing p50/p90: {dash.publicLatency.processing.p50Ms} /{" "}
            {dash.publicLatency.processing.p90Ms} ms
          </p>
          <p>
            Upstream p50/p90: {dash.publicLatency.upstream.p50Ms} /{" "}
            {dash.publicLatency.upstream.p90Ms} ms
          </p>
        </section>
      )}

      {dash?.indicators && (
        <section className="space-y-2">
          <h2 className="font-semibold text-zinc-100">Indicators</h2>
          <ul className="space-y-1 max-h-80 overflow-auto">
            {dash.indicators.map((i) => (
              <li key={i.id} className="border-b border-zinc-800/80 py-1">
                <span className="text-zinc-100">{i.name}</span> · {i.status} · n=
                {i.sampleSize} · achieved={String(i.achieved)}
                <div className="text-[10px] text-zinc-500">{i.note}</div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {dash?.sourceNotices && dash.sourceNotices.length > 0 && (
        <section>
          <h2 className="font-semibold text-zinc-100">Source notices</h2>
          <ul className="text-amber-300/90">
            {dash.sourceNotices.map((n) => (
              <li key={n.source}>{n.message}</li>
            ))}
          </ul>
        </section>
      )}

      {dash?.incidents && (
        <section>
          <h2 className="font-semibold text-zinc-100">Incidents</h2>
          <ul className="space-y-1">
            {dash.incidents.map((i) => (
              <li key={i.id}>
                <code className="text-[10px] text-zinc-500">{i.id}</code> {i.title}{" "}
                ({i.severity}/{i.status})
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded border border-zinc-800 p-3 space-y-2">
        <h2 className="font-semibold text-zinc-100">
          Subscription credit evaluation
        </h2>
        <p className="text-[11px] text-zinc-500">
          Preview before apply. Requires admin confirmation. Never a trading-loss
          reimbursement.
        </p>
        <label className="block text-[11px]">
          Incident IDs (comma-separated)
          <input
            className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
            value={incidentIds}
            onChange={(e) => setIncidentIds(e.target.value)}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-[11px]">
            Period start (ISO)
            <input
              className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              placeholder="2026-07-01T00:00:00.000Z"
            />
          </label>
          <label className="block text-[11px]">
            Period end (ISO)
            <input
              className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              placeholder="2026-08-01T00:00:00.000Z"
            />
          </label>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={() => void previewCredits()}>
            Preview credits
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={!evalId}
            onClick={() => void applyCredits()}
          >
            Apply credits
          </Button>
        </div>
        {preview != null && (
          <pre className="text-[10px] overflow-auto max-h-48 bg-black/40 p-2 rounded">
            {JSON.stringify(preview, null, 2)}
          </pre>
        )}
      </section>

      {report != null && (
        <section>
          <h2 className="font-semibold text-zinc-100">Monthly report</h2>
          <pre className="text-[10px] overflow-auto max-h-64 bg-black/40 p-2 rounded">
            {JSON.stringify(report, null, 2)}
          </pre>
        </section>
      )}

      <p className="text-[10px] text-zinc-600 whitespace-pre-wrap">
        {dash?.disclaimer}
        {"\n\n"}
        {dash?.legalPlaceholder}
      </p>

      {message && (
        <p className="text-sky-300/90" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
