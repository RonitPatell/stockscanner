import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/api-guard";
import {
  getSourceHealth,
  INGEST_SOURCES,
  isSourceFlagEnabled,
  listDeadLetters,
  getMarketPhase,
  intervalForPhase,
} from "@/lib/ingest";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Ingest Admin — TrustTicker",
  robots: { index: false, follow: false },
};

export default async function AdminIngestPage() {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    redirect("/login");
  }

  const phase = getMarketPhase();
  const sources = await Promise.all(
    INGEST_SOURCES.map(async (s) => {
      const health = await getSourceHealth(s.id, {
        tier: s.tier,
        enabled: isSourceFlagEnabled(s),
      });
      return {
        ...health,
        name: s.name,
        provider: s.provider,
        intervalMs: intervalForPhase(s.intervals, phase),
        isSec: !!s.isSec,
      };
    })
  );
  const dlq = await listDeadLetters(30);

  return (
    <div className="min-h-screen bg-[#090807] text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-[#090807]/90 backdrop-blur px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500">Admin</div>
          <h1 className="text-lg font-semibold">Priority ingest health</h1>
        </div>
        <div className="flex gap-3 text-sm">
          <Link href="/admin/latency" className="text-zinc-400 hover:text-zinc-200">
            Latency
          </Link>
          <Link href="/dashboard" className="text-zinc-400 hover:text-zinc-200">
            Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-6">
        <p className="text-sm text-zinc-400">
          Market phase: <span className="text-emerald-400">{phase}</span>. Intervals
          adapt by session — do not claim a fixed 2s poll unless configured,
          licensed, sustainable, and measured. SEC aggregate stays under 10 rps
          with a declared company User-Agent.
        </p>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Sources</h2>
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-950 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Tier</th>
                  <th className="px-3 py-2">Enabled</th>
                  <th className="px-3 py-2">Circuit</th>
                  <th className="px-3 py-2">Interval</th>
                  <th className="px-3 py-2">Last ok</th>
                  <th className="px-3 py-2">Fails</th>
                  <th className="px-3 py-2">Resp</th>
                  <th className="px-3 py-2">Items</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.sourceId} className="border-t border-zinc-800/80">
                    <td className="px-3 py-2">
                      {s.name}
                      {s.isSec ? (
                        <span className="ml-2 text-[10px] text-amber-400">SEC</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{s.tier}</td>
                    <td className="px-3 py-2">{s.enabled ? "yes" : "no"}</td>
                    <td className="px-3 py-2">{s.circuit}</td>
                    <td className="px-3 py-2">{Math.round(s.intervalMs / 1000)}s</td>
                    <td className="px-3 py-2 text-zinc-400">
                      {s.lastSuccessAt
                        ? new Date(s.lastSuccessAt).toLocaleTimeString()
                        : "—"}
                    </td>
                    <td className="px-3 py-2">{s.consecutiveFailures}</td>
                    <td className="px-3 py-2">
                      {s.lastResponseMs != null ? `${s.lastResponseMs}ms` : "—"}
                    </td>
                    <td className="px-3 py-2">{s.lastItemsReceived}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Dead-letter queue</h2>
          {dlq.length === 0 ? (
            <p className="text-sm text-zinc-500">Empty</p>
          ) : (
            <ul className="space-y-2">
              {dlq.map((d) => (
                <li
                  key={d.id}
                  className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="text-emerald-400">{d.sourceId}</span> · tier{" "}
                      {d.tier} · attempt {d.attempt}
                    </span>
                    <form action="/api/admin/ingest" method="post">
                      {/* Client POST via fetch is preferred; link documents the API */}
                      <span className="text-xs text-zinc-500">
                        POST /api/admin/ingest {"{"} action: retry_dlq, id: {d.id} {"}"}
                      </span>
                    </form>
                  </div>
                  <div className="mt-1 text-zinc-400">{d.error}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
