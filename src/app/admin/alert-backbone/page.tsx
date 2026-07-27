import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/api-guard";
import { getAlertBackboneHealthDashboard } from "@/lib/alert-backbone/health";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Alert Backbone — TrustTicker",
  robots: { index: false, follow: false },
};

export default async function AlertBackboneAdminPage() {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    redirect("/");
  }

  const dash = await getAlertBackboneHealthDashboard(24);
  const targets = dash.metrics.targets;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 text-zinc-100">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Alert Backbone V2</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Source + channel health. Targets are configuration, not claims.
          </p>
        </div>
        <Link href="/admin/latency" className="text-sm text-sky-400 hover:underline">
          Latency admin →
        </Link>
      </div>

      <p className="mb-4 rounded border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-200/90">
        {dash.disclaimer}
      </p>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-zinc-500">
          Configured targets
        </h2>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="rounded border border-zinc-800 bg-zinc-950/60 p-3">
            Provider→ingest p50/p90: {targets.providerToIngestionP50Ms}ms /{" "}
            {targets.providerToIngestionP90Ms}ms
          </div>
          <div className="rounded border border-zinc-800 bg-zinc-950/60 p-3">
            Ingest→classify p50/p90: {targets.ingestionToClassificationP50Ms}ms /{" "}
            {targets.ingestionToClassificationP90Ms}ms
          </div>
          <div className="rounded border border-zinc-800 bg-zinc-950/60 p-3">
            Classify→in-app p50/p90: {targets.classificationToInAppP50Ms}ms /{" "}
            {targets.classificationToInAppP90Ms}ms
          </div>
          <div className="rounded border border-zinc-800 bg-zinc-950/60 p-3">
            Channel success ≥ {(targets.alertChannelSuccessRateMin * 100).toFixed(0)}% ·
            dup ≤ {(targets.duplicateRateMax * 100).toFixed(0)}% · gaps/hr ≤{" "}
            {targets.dataGapsPerHourMax}
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-zinc-500">
          Target comparisons (not achieved unless noted)
        </h2>
        <ul className="space-y-1 text-sm">
          {dash.metrics.latencies.comparisons.map((c) => (
            <li
              key={c.metric}
              className="rounded border border-zinc-800 bg-zinc-950/40 px-3 py-2"
            >
              <span className="text-zinc-300">{c.metric}</span>: measured{" "}
              {c.measured ?? "n/a"} / target {c.target} · n={c.sampleSize} ·{" "}
              <span className={c.achieved ? "text-emerald-400" : "text-zinc-500"}>
                {c.achieved ? "meets target*" : "not achieved"}
              </span>
              <div className="text-xs text-zinc-500">{c.note}</div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-zinc-500">
          Queues
        </h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(dash.queues).map(([name, depth]) => (
            <div
              key={name}
              className="rounded border border-zinc-800 bg-zinc-950/60 p-3 text-sm"
            >
              <div className="font-medium text-zinc-200">{name}</div>
              <div className="mt-1 text-zinc-400">
                ready {depth.ready} · processing {depth.processing} · dlq {depth.dlq}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-zinc-500">
          Channels
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(dash.channels.successRates).map(([ch, v]) => (
            <div
              key={ch}
              className="rounded border border-zinc-800 bg-zinc-950/60 p-3 text-sm"
            >
              {ch}: sent {v.sent} / failed {v.failed} · rate{" "}
              {v.rate == null ? "n/a" : `${(v.rate * 100).toFixed(1)}%`}
            </div>
          ))}
          {Object.keys(dash.channels.successRates).length === 0 && (
            <div className="text-sm text-zinc-500">No channel samples yet.</div>
          )}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-zinc-500">
          Source heartbeats · gaps this hour: {dash.sources.dataGapsThisHour}
        </h2>
        <div className="max-h-64 overflow-auto rounded border border-zinc-800">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-zinc-900 text-zinc-500">
              <tr>
                <th className="px-2 py-1">Source</th>
                <th className="px-2 py-1">Mode</th>
                <th className="px-2 py-1">Last beat</th>
                <th className="px-2 py-1">Gap</th>
              </tr>
            </thead>
            <tbody>
              {dash.sources.heartbeats.map((hb) => (
                <tr key={hb.sourceId} className="border-t border-zinc-800/80">
                  <td className="px-2 py-1">{hb.sourceId}</td>
                  <td className="px-2 py-1">{hb.connectionMode}</td>
                  <td className="px-2 py-1">{hb.lastBeatAt}</td>
                  <td className="px-2 py-1">
                    {hb.gapDetected ? "yes" : "no"} ({hb.consecutiveMisses})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-zinc-500">
          Recent synthetic probes
        </h2>
        <ul className="space-y-1 text-sm text-zinc-300">
          {dash.probes.slice(0, 8).map((p) => (
            <li key={p.probeId} className="rounded border border-zinc-800 px-3 py-2">
              {p.probeId}: {p.status}
              {p.totalMs != null ? ` · ${p.totalMs}ms` : ""}
              {p.error ? ` · ${p.error}` : ""}
            </li>
          ))}
          {dash.probes.length === 0 && (
            <li className="text-zinc-500">No probes recorded yet.</li>
          )}
        </ul>
      </section>
    </main>
  );
}
