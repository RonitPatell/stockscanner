"use client";

import { useEffect, useState } from "react";

type FunnelPayload = {
  day: string;
  events: Record<string, number>;
  conversions: Record<string, number>;
  cohort: {
    usersTotal: number;
    usersActivated: number;
    usersTrialing: number;
    usersPaid: number;
    activationRate: number;
  };
  cancelReasons: Record<string, number>;
};

export function AdminFunnelClient() {
  const [day, setDay] = useState("");
  const [data, setData] = useState<FunnelPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const q = day ? `?day=${encodeURIComponent(day)}` : "";
    void fetch(`/api/admin/funnel${q}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Failed to load funnel");
        return r.json() as Promise<FunnelPayload>;
      })
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((e) => setError(String(e.message || e)))
      .finally(() => setLoading(false));
  }, [day]);

  if (loading && !data) {
    return <p className="text-sm text-zinc-500">Loading funnel…</p>;
  }
  if (error) {
    return <p className="text-sm text-red-400">{error}</p>;
  }
  if (!data) return null;

  const rows = Object.entries(data.events).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-zinc-400">
          Cohort day (UTC)
          <input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="mt-1 block rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm"
          />
        </label>
        <button
          type="button"
          className="text-sm text-zinc-400 hover:text-zinc-200 underline"
          onClick={() => setDay("")}
        >
          All-time counters
        </button>
        <span className="text-xs text-zinc-600">Showing: {data.day}</span>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-zinc-300 mb-3">Conversion %</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.entries(data.conversions).map(([k, v]) => (
            <div key={k} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
              <div className="text-[11px] uppercase tracking-wide text-zinc-500">{k.replace(/_/g, " ")}</div>
              <div className="text-2xl font-semibold text-emerald-400 mt-1">{v}%</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-zinc-300 mb-3">User cohort (DB)</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
          <Stat label="Users" value={data.cohort.usersTotal} />
          <Stat label="Activated" value={data.cohort.usersActivated} />
          <Stat label="Trialing" value={data.cohort.usersTrialing} />
          <Stat label="Paid active" value={data.cohort.usersPaid} />
          <Stat label="Activation rate" value={`${data.cohort.activationRate}%`} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-zinc-300 mb-3">Event counts</h2>
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-zinc-500">
                <th className="px-3 py-2 font-medium">Event</th>
                <th className="px-3 py-2 font-medium">Count</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([event, count]) => (
                <tr key={event} className="border-b border-zinc-900">
                  <td className="px-3 py-1.5 font-mono text-xs text-zinc-300">{event}</td>
                  <td className="px-3 py-1.5">{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-zinc-300 mb-3">Cancellation reasons</h2>
        <div className="flex flex-wrap gap-2">
          {Object.keys(data.cancelReasons).length === 0 && (
            <p className="text-xs text-zinc-600">No reasons recorded yet</p>
          )}
          {Object.entries(data.cancelReasons).map(([reason, n]) => (
            <span
              key={reason}
              className="text-xs px-2 py-1 rounded border border-zinc-700 text-zinc-300"
            >
              {reason}: {n}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="text-[11px] text-zinc-500">{label}</div>
      <div className="text-lg font-semibold mt-0.5">{value}</div>
    </div>
  );
}
