import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import {
  getReliabilityDashboard,
  loadIncidentsFromDb,
  RELIABILITY_DISCLAIMER,
  STATUS_PAGE_LEGAL_PLACEHOLDER,
} from "@/lib/reliability";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "System Status — TrustTicker",
  description:
    "Operational status for TrustTicker ingestion, alerts, and latency. Targets are not guarantees.",
};

function statusColor(s: string) {
  if (s === "operational") return "text-emerald-400";
  if (s === "degraded") return "text-amber-400";
  if (s === "outage") return "text-red-400";
  if (s === "maintenance") return "text-sky-400";
  return "text-zinc-500";
}

function overallFrom(
  statuses: string[]
): "operational" | "degraded" | "outage" | "insufficient_data" {
  if (statuses.includes("outage")) return "outage";
  if (statuses.includes("degraded")) return "degraded";
  if (statuses.every((s) => s === "insufficient_data")) return "insufficient_data";
  if (statuses.some((s) => s === "operational")) return "operational";
  return "insufficient_data";
}

export default async function StatusPage() {
  let data: Awaited<ReturnType<typeof getReliabilityDashboard>> & {
    overall: string;
    incidents: Awaited<ReturnType<typeof loadIncidentsFromDb>>;
  } | null = null;

  try {
    const [dash, incidents] = await Promise.all([
      getReliabilityDashboard(24),
      loadIncidentsFromDb().catch(() => []),
    ]);
    data = {
      ...dash,
      overall: overallFrom(dash.indicators.map((i) => i.status)),
      incidents,
    };
  } catch {
    data = null;
  }

  return (
    <div className="marketing-shell min-h-screen">
      <header className="sticky top-0 z-40 border-b mk-hairline bg-[rgba(9,8,7,0.72)] backdrop-blur-xl px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <LogoMark className="w-7 h-7" />
          <span className="font-semibold tracking-tight">
            Trust<span className="text-emerald-400">Ticker</span>
          </span>
        </Link>
        <Link href="/wins" className="text-sm text-zinc-400 hover:text-zinc-200">
          Latency stats
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-12 space-y-8">
        <div>
          <p className="text-xs uppercase tracking-wide text-emerald-400/90 mb-2">
            Service status
          </p>
          <h1 className="text-3xl font-semibold text-zinc-100 mb-2">
            TrustTicker system status
          </h1>
          <p className="text-sm text-zinc-400 max-w-xl">
            Measured indicators with sample sizes. Configured targets are not
            marked achieved until production data verifies them.
          </p>
          {data?.overall && (
            <p className={`mt-4 text-lg font-medium ${statusColor(data.overall)}`}>
              Overall: {data.overall.replace(/_/g, " ")}
            </p>
          )}
        </div>

        {!data && (
          <p className="text-amber-400/90 text-sm">
            Status data temporarily unavailable.
          </p>
        )}

        {data?.live && (
          <section className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
            <h2 className="text-sm font-semibold text-zinc-100 mb-1">
              Live connection
            </h2>
            <p className="text-sm text-zinc-300">{data.live.label}</p>
            <p className="text-[11px] text-zinc-500 mt-1">
              Feed n={data.live.sampleSizes.feed} · Stream n=
              {data.live.sampleSizes.browserStream} · Alerts n=
              {data.live.sampleSizes.alertDelivery}
            </p>
          </section>
        )}

        {data?.publicLatency && (
          <section className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4 space-y-2">
            <h2 className="text-sm font-semibold text-zinc-100">
              Latency (aggregated, no cherry-picking)
            </h2>
            <p className="text-[11px] text-zinc-500">{data.publicLatency.note}</p>
            <ul className="text-sm text-zinc-300 space-y-1">
              <li>
                TrustTicker processing p50/p90:{" "}
                {fmtMs(data.publicLatency.processing.p50Ms)} /{" "}
                {fmtMs(data.publicLatency.processing.p90Ms)}
              </li>
              <li>
                Upstream provider p50/p90:{" "}
                {fmtMs(data.publicLatency.upstream.p50Ms)} /{" "}
                {fmtMs(data.publicLatency.upstream.p90Ms)}
              </li>
              <li>
                Total p50/p90: {fmtMs(data.publicLatency.total.p50Ms)} /{" "}
                {fmtMs(data.publicLatency.total.p90Ms)} (n=
                {data.publicLatency.sampleSize})
              </li>
            </ul>
          </section>
        )}

        {data?.indicators && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-zinc-100">Indicators</h2>
            <ul className="space-y-2">
              {data.indicators.map((i) => (
                <li
                  key={i.id}
                  className="rounded border border-zinc-800 bg-zinc-950/40 p-3"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-zinc-100">
                      {i.name}
                    </span>
                    <span className={`text-xs ${statusColor(i.status)}`}>
                      {i.status.replace(/_/g, " ")}
                      {i.achieved ? " · target met" : " · not achieved"}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-1">{i.definition}</p>
                  <p className="text-xs text-zinc-400 mt-1">
                    Measured: {fmtVal(i.measured, i.unit)} · Target:{" "}
                    {fmtVal(i.target, i.unit)} · n={i.sampleSize}
                  </p>
                  <p className="text-[10px] text-zinc-600 mt-0.5">{i.note}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {data?.sourceNotices && data.sourceNotices.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-100">
              Source-specific notices
            </h2>
            <ul className="space-y-1 text-sm">
              {data.sourceNotices.map((n) => (
                <li key={n.source} className={statusColor(n.status)}>
                  {n.message}
                </li>
              ))}
            </ul>
          </section>
        )}

        {data?.incidents && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-zinc-100">
              Incident timeline
            </h2>
            {data.incidents.length === 0 && (
              <p className="text-sm text-zinc-500">No recent incidents.</p>
            )}
            <ul className="space-y-2">
              {data.incidents.slice(0, 30).map((inc) => (
                <li
                  key={inc.id}
                  className="rounded border border-zinc-800 p-3 text-sm"
                >
                  <div className="font-medium text-zinc-100">{inc.title}</div>
                  <div className="text-[11px] text-zinc-500">
                    {inc.severity} · {inc.status} ·{" "}
                    {new Date(inc.startedAt).toLocaleString()}
                    {inc.endedAt
                      ? ` → ${new Date(inc.endedAt).toLocaleString()}`
                      : " → ongoing"}
                    {inc.announcedMaintenance ? " · announced maintenance" : ""}
                  </div>
                  <p className="text-zinc-400 mt-1">{inc.summary}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="text-[10px] text-zinc-600 whitespace-pre-wrap">
          {data?.disclaimer ?? RELIABILITY_DISCLAIMER}
          {"\n\n"}
          {data?.legalPlaceholder ?? STATUS_PAGE_LEGAL_PLACEHOLDER}
        </p>

        <DisclaimerBanner />
      </main>
    </div>
  );
}

function fmtMs(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}s`;
  return `${Math.round(n)}ms`;
}

function fmtVal(n: number | null | undefined, unit: string) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (unit === "rate") return `${(n * 100).toFixed(2)}%`;
  if (unit === "ms") return fmtMs(n);
  return String(n);
}
