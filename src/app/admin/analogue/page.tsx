import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/api-guard";
import {
  getAnalogueBiasReport,
  ANALOGUE_ENGINE_VERSION,
  ANALOGUE_METHODOLOGY,
} from "@/lib/analogue";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Analogue Bias Diagnostics — TrustTicker",
  robots: { index: false, follow: false },
};

export default async function AnalogueAdminPage() {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    redirect("/");
  }

  const report = await getAnalogueBiasReport({ lookbackDays: 365 });

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 text-zinc-100">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Historical Analogue Bias Diagnostics
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Engine {ANALOGUE_ENGINE_VERSION} · survivorship & selection checks —
            not a trading model
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <Link
            href="/admin/reaction-stage"
            className="text-sky-400 hover:underline"
          >
            Reaction stage →
          </Link>
          <Link href="/admin/judgment" className="text-sky-400 hover:underline">
            Judgment →
          </Link>
        </div>
      </div>

      <section className="mb-6 rounded-lg border border-zinc-800 bg-zinc-950/50 p-4 space-y-2 text-sm">
        <p className="text-zinc-300">{ANALOGUE_METHODOLOGY.summary}</p>
        <p className="text-xs text-zinc-500">{ANALOGUE_METHODOLOGY.noLookAhead}</p>
        <p className="text-xs text-zinc-500">{report.disclaimer}</p>
      </section>

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <Stat label="Corpus size" value={String(report.corpusSize)} />
        <Stat
          label="With outcomes"
          value={`${report.withOutcome}${
            report.outcomeCoverage != null
              ? ` (${(report.outcomeCoverage * 100).toFixed(0)}%)`
              : ""
          }`}
        />
        <Stat
          label="Delisted / changed"
          value={`${report.delistedOrChangedCount}${
            report.delistedShare != null
              ? ` (${(report.delistedShare * 100).toFixed(1)}%)`
              : ""
          }`}
        />
      </div>

      <section className="mb-6 space-y-2">
        <h2 className="text-sm font-semibold text-amber-200/90">
          Survivorship flags
        </h2>
        {report.survivorshipFlags.length === 0 ? (
          <p className="text-sm text-zinc-500">No survivorship flags fired.</p>
        ) : (
          <ul className="list-disc pl-5 text-sm text-amber-100/90 space-y-1">
            {report.survivorshipFlags.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-6 space-y-2">
        <h2 className="text-sm font-semibold text-sky-200/90">Selection flags</h2>
        {report.selectionFlags.length === 0 ? (
          <p className="text-sm text-zinc-500">No selection flags fired.</p>
        ) : (
          <ul className="list-disc pl-5 text-sm text-sky-100/90 space-y-1">
            {report.selectionFlags.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold mb-2">By classification version</h2>
        <table className="w-full text-left text-xs font-mono">
          <thead>
            <tr className="text-zinc-500">
              <th className="py-1">Version</th>
              <th>n</th>
              <th>With outcome</th>
            </tr>
          </thead>
          <tbody>
            {report.byClassificationVersion.map((r) => (
              <tr key={r.version} className="border-t border-zinc-800">
                <td className="py-1">{r.version}</td>
                <td>{r.n}</td>
                <td>{r.withOutcome}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-semibold mb-2">By session</h2>
        <table className="w-full text-left text-xs font-mono">
          <thead>
            <tr className="text-zinc-500">
              <th className="py-1">Session</th>
              <th>n</th>
              <th>With outcome</th>
            </tr>
          </thead>
          <tbody>
            {report.bySession.map((r) => (
              <tr key={r.session} className="border-t border-zinc-800">
                <td className="py-1">{r.session}</td>
                <td>{r.n}</td>
                <td>{r.withOutcome}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {report.excludedReasons.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-2">Exclusion reasons</h2>
          <ul className="text-xs text-zinc-400 space-y-1">
            {report.excludedReasons.map((r) => (
              <li key={r.reason}>
                {r.reason}: {r.n}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
