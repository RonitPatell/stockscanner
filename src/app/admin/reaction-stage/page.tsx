import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/api-guard";
import { getReactionStageCalibrationReport } from "@/lib/reaction-stage/calibration";
import { REACTION_STAGE_ENGINE_VERSION } from "@/lib/reaction-stage/version";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Reaction Stage Calibration — TrustTicker",
  robots: { index: false, follow: false },
};

export default async function ReactionStageAdminPage() {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    redirect("/");
  }

  const report = await getReactionStageCalibrationReport(168);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 text-zinc-100">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Reaction Stage Calibration
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Engine {REACTION_STAGE_ENGINE_VERSION} · observational only — not a
            profit model
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <Link href="/admin/latency" className="text-sky-400 hover:underline">
            Latency →
          </Link>
          <Link
            href="/admin/alert-backbone"
            className="text-sky-400 hover:underline"
          >
            Alert Backbone →
          </Link>
        </div>
      </div>

      <p className="mb-4 rounded border border-amber-900/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-200/90">
        {report.disclaimer}
      </p>

      <section className="mb-8 grid gap-3 sm:grid-cols-3">
        <Stat label="Sample size" value={String(report.sampleSize)} />
        <Stat
          label="Missing-data rate"
          value={
            report.missingDataRate == null
              ? "n/a"
              : `${(report.missingDataRate * 100).toFixed(1)}%`
          }
        />
        <Stat label="Window" value={`${report.hours}h`} />
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-zinc-500">
          Outcome distribution by starting state
        </h2>
        <div className="overflow-auto rounded border border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-900 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-2">Stage</th>
                <th className="px-3 py-2">n</th>
                <th className="px-3 py-2">Avg raw return %</th>
                <th className="px-3 py-2">Avg MFE %</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(report.outcomeByStartingStage).map(([stage, v]) => (
                <tr key={stage} className="border-t border-zinc-800">
                  <td className="px-3 py-2 font-mono">{stage}</td>
                  <td className="px-3 py-2">{v.n}</td>
                  <td className="px-3 py-2">
                    {v.avgRawReturnPct == null ? "—" : v.avgRawReturnPct.toFixed(2)}
                  </td>
                  <td className="px-3 py-2">
                    {v.avgMfePct == null ? "—" : v.avgMfePct.toFixed(2)}
                  </td>
                </tr>
              ))}
              {Object.keys(report.outcomeByStartingStage).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-zinc-500">
                    No snapshots yet. Stages persist when the engine is wired to
                    ingest/live recompute.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-zinc-500">
          State transitions
        </h2>
        <ul className="space-y-1 text-sm">
          {report.transitions.map((t) => (
            <li
              key={`${t.from}-${t.to}`}
              className="rounded border border-zinc-800 px-3 py-2 font-mono"
            >
              {t.from} → {t.to}: {t.count}
            </li>
          ))}
          {report.transitions.length === 0 && (
            <li className="text-zinc-500">No transitions recorded.</li>
          )}
        </ul>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded border border-zinc-800 bg-zinc-950/60 p-3">
          <div className="text-xs uppercase text-zinc-500">False stale (audit)</div>
          <div className="mt-1 text-lg">
            n={report.falseStale.n}
            {report.falseStale.rate != null
              ? ` · ${(report.falseStale.rate * 100).toFixed(1)}%`
              : ""}
          </div>
          <p className="mt-1 text-xs text-zinc-500">{report.falseStale.note}</p>
        </div>
        <div className="rounded border border-zinc-800 bg-zinc-950/60 p-3">
          <div className="text-xs uppercase text-zinc-500">False early (audit)</div>
          <div className="mt-1 text-lg">
            n={report.falseEarly.n}
            {report.falseEarly.rate != null
              ? ` · ${(report.falseEarly.rate * 100).toFixed(1)}%`
              : ""}
          </div>
          <p className="mt-1 text-xs text-zinc-500">{report.falseEarly.note}</p>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950/60 p-3">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
