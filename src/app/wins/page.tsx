import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasActiveSubscription } from "@/lib/subscription";
import { getSpeedWins, getIngestLatencyStats } from "@/lib/speed-wins";
import { SpeedWinCard, LiveProofStrip } from "@/components/LiveProofStrip";
import { LogoMark } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { CatchesBoard } from "@/components/CatchesBoard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Latency Stats — TrustTicker",
  description:
    "Reproducible aggregated ingest latency and recent catalyst examples. Sample sizes shown; no cherry-picked speed claims.",
};

export default async function WinsPage() {
  const session = await auth();
  let isSubscribed = false;
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { subscriptionStatus: true, subscriptionEndsAt: true },
    });
    isSubscribed = hasActiveSubscription(user ?? undefined);
  }

  const [wins, latency] = await Promise.all([getSpeedWins(24, 168), getIngestLatencyStats(24)]);

  return (
    <div className="marketing-shell min-h-screen">
      <header className="sticky top-0 z-40 border-b mk-hairline bg-[rgba(9,8,7,0.72)] backdrop-blur-xl px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
          <LogoMark className="w-7 h-7" />
          <span className="font-semibold tracking-tight">
            Trust<span className="text-emerald-400">Ticker</span>
          </span>
        </Link>
        <div className="flex gap-2">
          {isSubscribed ? (
            <Link href="/dashboard">
              <Button size="sm">Open scanner</Button>
            </Link>
          ) : (
            <>
              <Link href="/demo">
                <Button variant="outline" size="sm">
                  Demo
                </Button>
              </Link>
              <Link href="/pricing">
                <Button size="sm" className="cta-glow">
                  Start trial
                </Button>
              </Link>
            </>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-14 sm:py-16">
        <div className="text-center mb-12">
          <p className="mk-tick !text-emerald-400 mb-4">Latency · aggregated</p>
          <h1 className="mk-display text-3xl sm:text-4xl mb-3">
            Measured ingest latency
          </h1>
          <p className="text-[var(--text-secondary)] max-w-xl mx-auto">
            Reproducible aggregates over all in-window samples (including slow ones).
            Processing vs upstream split is on{" "}
            <a href="/status" className="text-emerald-400/90 underline">
              /status
            </a>
            .
          </p>
        </div>

        <LiveProofStrip className="mb-10" />
        <CatchesBoard className="mb-10" />

        {latency.sampleSize > 0 && (
          <div className="mk-corners grid grid-cols-2 sm:grid-cols-4 border-t border-l mk-hairline mb-10">
            {[
              { label: "Avg ingest", value: `${latency.avgSec}s` },
              { label: "Median", value: `${latency.p50Sec}s` },
              { label: "Under 3m", value: `${latency.under3mRate ?? latency.under60sRate}%` },
              { label: "Sample (24h)", value: String(latency.sampleSize) },
            ].map((s) => (
              <div
                key={s.label}
                className="border-b border-r mk-hairline px-4 py-4 text-center bg-[var(--bg-graphite)]/50"
              >
                <div className="mk-stat text-lg text-emerald-400">
                  {s.value}
                </div>
                <div className="mk-tick mt-1">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        )}

        {wins.length === 0 ? (
          <p className="text-center text-zinc-600 py-16">
            Speed wins populate as the feed ingests live catalysts. Check back during market hours.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-px bg-[var(--hairline)] border mk-hairline mb-4">
            {wins.map((w) => (
              <SpeedWinCard key={w.id} win={w} showTimeline />
            ))}
          </div>
        )}

        <div className="text-center pt-4">
          {isSubscribed ? (
            <Link href="/dashboard">
              <Button size="lg" className="mt-8 cta-glow">
                Back to live scanner <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          ) : (
            <Link href="/pricing">
              <Button size="lg" className="mt-8 cta-glow">
                Catch the next one — Start free trial <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          )}
        </div>

        <div className="mt-12">
          <DisclaimerBanner compact />
        </div>
      </main>
    </div>
  );
}
