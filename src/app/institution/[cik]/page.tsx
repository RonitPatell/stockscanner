import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { getInstitution13fReport } from "@/lib/institutional/get-report";
import type { InstitutionalPositionView } from "@/lib/institutional/get-report";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ cik: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cik } = await params;
  return {
    title: `Institutional filings CIK ${cik} — TrustTicker`,
    description:
      "Form 13F institutional filings — delayed period data, not real-time.",
  };
}

function fmtShares(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtMoney(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  return `$${Math.round(v).toLocaleString("en-US")}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function PositionList({
  title,
  rows,
}: {
  title: string;
  rows: InstitutionalPositionView[];
}) {
  if (rows.length === 0) {
    return (
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
        <p className="text-[12px] text-zinc-600">None in this period.</p>
      </section>
    );
  }
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={`${r.symbol}-${r.changeKind}-${r.accessionNumber}`}
            className="rounded-lg border border-zinc-800 px-3 py-2 flex flex-wrap items-baseline justify-between gap-2"
          >
            <div>
              <Link
                href={`/ticker/${r.symbol}?tab=ownership`}
                className="font-mono text-emerald-400 hover:underline"
              >
                {r.symbol}
              </Link>
              <span className="text-[11px] text-zinc-500 ml-2">
                {r.issuerName}
              </span>
            </div>
            <div className="text-[11px] font-mono text-zinc-300">
              {fmtShares(r.shares)} · {fmtMoney(r.valueUsd)}
              {r.sharesChange != null ? (
                <span className="text-zinc-500 ml-2">
                  Δ {fmtShares(r.sharesChange)}
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function InstitutionPage({ params }: Props) {
  const { cik: raw } = await params;
  const cik = raw.replace(/\D/g, "").slice(0, 10);
  if (!cik) notFound();

  const report = await getInstitution13fReport(cik);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <LogoMark className="w-7 h-7" />
          <span className="font-bold">
            Trust<span className="text-emerald-400">Ticker</span>
          </span>
        </Link>
        <Link href="/dashboard?view=research">
          <Button variant="outline" size="sm">
            Research
          </Button>
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10 space-y-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500 mb-2">
            Institutional filings
          </p>
          <h1 className="text-2xl font-semibold">{report.filerName}</h1>
          <p className="text-[12px] text-zinc-500 font-mono mt-1">CIK {cik}</p>
        </div>

        <p
          className="text-[12px] text-amber-200/80 border border-amber-500/20 rounded-lg px-3 py-2 bg-amber-500/5 leading-relaxed"
          data-testid="institutional-delay-disclosure"
        >
          {report.disclosure}
        </p>

        <dl className="grid grid-cols-2 gap-3 text-[12px]">
          <div>
            <dt className="text-zinc-600">Latest period end</dt>
            <dd>{fmtDate(report.latestReportDate)}</dd>
          </div>
          <div>
            <dt className="text-zinc-600">Prior comparable</dt>
            <dd>{fmtDate(report.priorReportDate)}</dd>
          </div>
          <div>
            <dt className="text-zinc-600">Filed</dt>
            <dd>{fmtDate(report.filedAt)}</dd>
          </div>
          <div>
            <dt className="text-zinc-600">Accession</dt>
            <dd className="font-mono text-[10px] text-zinc-400">
              {report.accessionNumber ?? "—"}
            </dd>
          </div>
        </dl>

        {report.sourceUrl ? (
          <a
            href={report.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[12px] text-emerald-400 hover:underline"
          >
            SEC source <ExternalLink className="w-3 h-3" />
          </a>
        ) : null}

        {report.empty ? (
          <p className="text-zinc-500 text-sm">
            No processed 13F snapshots for this filer yet. Background ingest
            pulls from SEC public filings.
          </p>
        ) : (
          <div className="space-y-6">
            <PositionList title="Largest new positions" rows={report.largestNew} />
            <PositionList
              title="Largest increases"
              rows={report.largestIncreases}
            />
            <PositionList
              title="Largest reductions"
              rows={report.largestReductions}
            />
            <PositionList title="Exited positions" rows={report.exited} />
          </div>
        )}

        <DisclaimerBanner />
      </main>
    </div>
  );
}
