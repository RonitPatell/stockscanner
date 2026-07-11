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

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Speed Wins — TrustTicker",
  description:
    "Real catalyst catches: headline published, ingested in seconds, stock moved. Proof of TrustTicker wire speed.",
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
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800 px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <LogoMark className="w-7 h-7" />
          <span className="font-bold">
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
                <Button size="sm">Start trial</Button>
              </Link>
            </>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold mb-3">Caught before the crowd</h1>
          <p className="text-zinc-400 max-w-xl mx-auto">
            Real headlines from our feed — publish time, ingest delay, and how the stock moved.
            This is what you&apos;re paying for.
          </p>
        </div>

        <LiveProofStrip className="mb-10" />

        {latency.sampleSize > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
            {[
              { label: "Avg ingest", value: `${latency.avgSec}s` },
              { label: "Median", value: `${latency.p50Sec}s` },
              { label: "Under 3m", value: `${latency.under3mRate ?? latency.under60sRate}%` },
              { label: "Sample (24h)", value: String(latency.sampleSize) },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-center"
              >
                <div className="text-lg font-bold text-emerald-400 font-mono">{s.value}</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {wins.length === 0 ? (
          <p className="text-center text-zinc-500 py-16">
            Speed wins populate as the feed ingests live catalysts. Check back during market hours.
          </p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {wins.map((w) => (
              <SpeedWinCard key={w.id} win={w} showTimeline />
            ))}
          </div>
        )}

        <div className="text-center">
          {isSubscribed ? (
            <Link href="/dashboard">
              <Button size="lg" className="mt-8">
                Back to live scanner <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          ) : (
            <Link href="/pricing">
              <Button size="lg" className="mt-8">
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
