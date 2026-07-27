import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/api-guard";
import { getAdminLatencyDashboard } from "@/lib/latency-trace";
import type { LatencyAggregateStats, LatencySegmentReport } from "@/lib/latency-trace";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Latency Admin — TrustTicker",
  robots: { index: false, follow: false },
};

function StatsBlock({ title, stats }: { title: string; stats: LatencyAggregateStats }) {
  if (!stats.available) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
        <div className="text-xs uppercase tracking-wide text-zinc-500">{title}</div>
        <div className="mt-1 text-sm text-amber-400/90">
          Unavailable (n={stats.count}; need more samples)
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{title}</div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-zinc-200 sm:grid-cols-4">
        <div>n {stats.count}</div>
        <div>p50 {stats.p50}ms</div>
        <div>p90 {stats.p90}ms</div>
        <div>p99 {stats.p99}ms</div>
        <div>min {stats.min}ms</div>
        <div>max {stats.max}ms</div>
        <div>&lt;30s {stats.pctUnder30s}%</div>
        <div>&lt;60s {stats.pctUnder60s}%</div>
        <div>&lt;90s {stats.pctUnder90s}%</div>
        <div>&lt;180s {stats.pctUnder180s}%</div>
      </div>
    </div>
  );
}

function SegmentSection({
  heading,
  segments,
}: {
  heading: string;
  segments: LatencySegmentReport[];
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-zinc-100">{heading}</h2>
      <div className="space-y-3">
        {segments.map((seg) => (
          <div key={seg.label} className="space-y-2">
            <div className="text-xs font-medium text-emerald-400/90">{seg.label}</div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              <StatsBlock title="Total" stats={seg.total} />
              <StatsBlock title="Fetch" stats={seg.fetch} />
              <StatsBlock title="Processing" stats={seg.processing} />
              <StatsBlock title="Delivery" stats={seg.delivery} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function AdminLatencyPage({
  searchParams,
}: {
  searchParams: Promise<{ hours?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    redirect("/login");
  }

  const params = await searchParams;
  const hoursRaw = Number(params.hours ?? "24");
  const hours = ([1, 6, 24, 72, 168] as const).includes(hoursRaw as 24)
    ? (hoursRaw as 1 | 6 | 24 | 72 | 168)
    : 24;

  const dash = await getAdminLatencyDashboard({ hours });

  return (
    <div className="min-h-screen bg-[#090807] text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-[#090807]/90 backdrop-blur px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500">Admin</div>
          <h1 className="text-lg font-semibold">Source → user latency</h1>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {[1, 6, 24, 72, 168].map((h) => (
            <Link
              key={h}
              href={`/admin/latency?hours=${h}`}
              className={
                h === hours
                  ? "text-emerald-400"
                  : "text-zinc-400 hover:text-zinc-200"
              }
            >
              {h}h
            </Link>
          ))}
          <Link href="/dashboard" className="text-zinc-400 hover:text-zinc-200">
            Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-4 py-6">
        <p className="text-sm text-zinc-400">
          Generated {dash.generatedAt} · window {dash.hours}h · min samples{" "}
          {dash.minSamples} · rows {dash.sampleCount}. Cohorts stay separated —
          do not treat overall as a public speed claim across earnings, recaps, and filings.
        </p>

        <SegmentSection heading="Overall (admin only)" segments={[dash.overall]} />
        <SegmentSection heading="By metric cohort" segments={dash.byCohort} />
        <SegmentSection heading="Actionable vs non-actionable" segments={dash.byActionable} />
        <SegmentSection heading="By source" segments={dash.bySource} />
        <SegmentSection heading="By source tier" segments={dash.bySourceTier} />
        <SegmentSection heading="By market session" segments={dash.byMarketSession} />
        <SegmentSection heading="By catalyst type" segments={dash.byCatalystType} />
        <SegmentSection heading="By timestamp quality" segments={dash.byTimestampQuality} />
      </main>
    </div>
  );
}
