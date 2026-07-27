import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasActiveSubscription } from "@/lib/subscription";
import { buildSessionPlan } from "@/lib/session-plan";
import { getIngestLatencyStats } from "@/lib/speed-wins";
import { LogoMark } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { formatPercent } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Today’s Setups & Skips — TrustTicker",
  description:
    "Free daily catalyst plan: 3 setups and 2 skips. See what to trade and what to avoid — then unlock live Pro.",
  openGraph: {
    title: "Today’s Setups & Skips — TrustTicker",
    description: "3 setups. 2 skips. Trade the plan, skip the trap.",
  },
};

export default async function TodayPage() {
  const session = await auth();
  let isSubscribed = false;
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { subscriptionStatus: true, subscriptionEndsAt: true },
    });
    isSubscribed = hasActiveSubscription(user ?? undefined);
  }

  const [plan, latency] = await Promise.all([
    buildSessionPlan(),
    getIngestLatencyStats(24),
  ]);

  const updated = new Date(plan.generatedAt).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

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
                  Start free trial
                </Button>
              </Link>
            </>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-14 sm:py-16">
        <p className="mk-tick !text-emerald-400 mb-4">Free for everyone</p>
        <h1 className="mk-display text-3xl sm:text-4xl mb-3">
          Today’s 3 setups &amp; 2 skips
        </h1>
        <p className="text-[var(--text-secondary)] mb-2 max-w-xl">
          Public daily plan — what to focus on, what to avoid. Updated{" "}
          <span className="text-[var(--text-primary)]">{updated} ET</span>.
        </p>
        {latency.sampleSize > 0 && (
          <p className="mk-tick mb-10">
            Live-race wire: {latency.under3mRate ?? "—"}% under 3m · n={latency.sampleSize}
          </p>
        )}

        <section className="mb-8 border mk-hairline bg-emerald-500/[0.04]">
          <div className="px-5 py-3 border-b mk-hairline">
            <h2 className="mk-tick !text-emerald-400">Setups</h2>
          </div>
          {plan.setups.length === 0 ? (
            <p className="text-sm text-zinc-500 px-5 py-4">No high-conviction setups in the current feed.</p>
          ) : (
            <ul className="divide-y divide-[var(--hairline)]">
              {plan.setups.map((s) => (
                <li key={s.symbol} className="px-5 py-4 transition-colors hover:bg-emerald-500/[0.03]">
                  <div className="flex items-center gap-2 mb-1">
                    <Link
                      href={`/ticker/${s.symbol}`}
                      className="font-mono font-bold text-lg hover:text-emerald-400 tracking-tight"
                    >
                      {s.symbol}
                    </Link>
                    <span className="text-[10px] uppercase tracking-wide text-emerald-400/90 border border-emerald-500/25 px-1.5 py-0.5">
                      {s.bias}
                    </span>
                    {s.changePercent != null && (
                      <span className="font-mono text-xs text-zinc-500">
                        {formatPercent(s.changePercent)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-zinc-300 mb-1">{s.headline}</p>
                  <p className="text-xs text-zinc-500">{s.action}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mb-10 border mk-hairline bg-amber-500/[0.04]">
          <div className="px-5 py-3 border-b mk-hairline">
            <h2 className="mk-tick !text-amber-400/90">Skips</h2>
          </div>
          {plan.skips.length === 0 ? (
            <p className="text-sm text-zinc-500 px-5 py-4">No dilution / FOMO skips flagged right now.</p>
          ) : (
            <ul className="divide-y divide-[var(--hairline)]">
              {plan.skips.map((s) => (
                <li key={s.symbol} className="px-5 py-4 transition-colors hover:bg-amber-500/[0.03]">
                  <div className="flex items-center gap-2 mb-1">
                    <Link
                      href={`/ticker/${s.symbol}`}
                      className="font-mono font-bold text-lg hover:text-amber-300 tracking-tight"
                    >
                      {s.symbol}
                    </Link>
                    <span className="text-[10px] uppercase tracking-wide text-amber-400/90 border border-amber-500/25 px-1.5 py-0.5">
                      skip
                    </span>
                  </div>
                  <p className="text-sm text-zinc-300 mb-1">{s.headline}</p>
                  <p className="text-xs text-zinc-500">{s.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-center text-zinc-600 text-sm italic mb-10">{plan.mantra}</p>

        <div className="mk-panel mk-corners p-6 sm:p-8 text-center">
          {isSubscribed ? (
            <>
              <h3 className="text-xl font-bold display-font mb-2">You’re on Pro</h3>
              <p className="text-sm text-zinc-500 mb-5 max-w-md mx-auto">
                This page is free for everyone to share. Your live scanner, alerts, and Prop Desk are
                on the dashboard.
              </p>
              <Link href="/dashboard">
                <Button size="lg" className="cta-glow">
                  Back to live scanner
                </Button>
              </Link>
            </>
          ) : (
            <>
              <h3 className="text-xl font-bold display-font mb-2">Want this on your watchlist — live?</h3>
              <p className="text-sm text-zinc-500 mb-5 max-w-md mx-auto">
                Pro unlocks the live wire feed, alerts, dilution radar, Prop Desk, and a personal
                session plan every morning. 7-day free trial.
              </p>
              <Link href="/pricing">
                <Button size="lg" className="cta-glow">
                  Start free trial — $19.99/mo after
                </Button>
              </Link>
            </>
          )}
        </div>

        <div className="mt-10">
          <DisclaimerBanner compact />
        </div>
      </main>
    </div>
  );
}
