import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCatalystsForSymbol } from "@/lib/speed-wins";
import { LogoMark } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { cn, formatPercent } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ symbol: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { symbol } = await params;
  const sym = symbol.toUpperCase().replace(/[^A-Z]/g, "");
  return {
    title: `${sym} Catalyst News — TrustTicker`,
    description: `Latest stock catalyst headlines for ${sym}. Near-real-time wire ingest, sentiment, and move context.`,
    openGraph: {
      title: `${sym} catalyst feed | TrustTicker`,
      description: `Breaking news and catalysts for ${sym} stock.`,
    },
  };
}

export default async function TickerPage({ params }: Props) {
  const { symbol } = await params;
  const sym = symbol.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5);
  if (!sym || sym.length < 1) notFound();

  const rows = await getCatalystsForSymbol(sym, 25);

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <LogoMark className="w-7 h-7" />
          <span className="font-bold">
            Trust<span className="text-emerald-400">Ticker</span>
          </span>
        </Link>
        <Link href="/pricing">
          <Button size="sm">Get live feed — $40/mo</Button>
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold mb-1">
          <span className="font-mono text-emerald-400">{sym}</span> catalyst news
        </h1>
        <p className="text-zinc-400 text-sm mb-8">
          Recent stock-impact headlines for ${sym}. Subscribers get near-real-time wire ingest and
          alerts.
        </p>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-8 text-center text-zinc-500">
            No recent catalysts for {sym} in our feed yet.
            <Link href="/pricing" className="block mt-4 text-emerald-400 hover:underline">
              Start trial for live coverage →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => {
              const delaySec = Math.max(
                0,
                Math.round((r.createdAt.getTime() - r.publishedAt.getTime()) / 1000)
              );
              return (
                <article
                  key={r.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <time className="text-[10px] text-zinc-500">
                      {r.publishedAt.toLocaleString()}
                    </time>
                    {delaySec < 120 && (
                      <span className="text-[10px] text-emerald-500 font-mono">
                        +{delaySec}s ingest
                      </span>
                    )}
                  </div>
                  <h2 className="text-sm font-medium text-zinc-200 mb-2">{r.headline}</h2>
                  <div className="flex flex-wrap gap-2 text-[10px] text-zinc-500">
                    <span>{r.source}</span>
                    {r.catalystType && <span>· {r.catalystType}</span>}
                    {r.changePercent != null && (
                      <span
                        className={cn(
                          "font-mono",
                          r.changePercent >= 0 ? "text-emerald-400" : "text-red-400"
                        )}
                      >
                        {formatPercent(r.changePercent)}
                      </span>
                    )}
                    {r.sentimentScore != null && (
                      <span>· sentiment {Math.round(r.sentimentScore)}</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="mt-10 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-6 text-center">
          <h3 className="font-semibold text-emerald-300 mb-2">Get {sym} the instant it hits the wire</h3>
          <p className="text-sm text-zinc-400 mb-4">
            Full feed, alerts, playbooks, and ~8s wire cycles — 7-day free trial.
          </p>
          <Link href="/pricing">
            <Button>Start free trial</Button>
          </Link>
        </div>

        <div className="mt-8">
          <DisclaimerBanner compact />
        </div>
      </main>
    </div>
  );
}
