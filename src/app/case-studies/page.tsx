import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasActiveSubscription } from "@/lib/subscription";
import { getPublicCaseStudies } from "@/lib/calibration/service";
import { CALIBRATION_DISCLAIMER } from "@/lib/calibration/types";
import { LogoMark } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Case Studies — TrustTicker",
  description:
    "Approved, auditable catalyst reaction examples. Classification quality — not guaranteed profits.",
};

export default async function CaseStudiesPage() {
  const session = await auth();
  let isSubscribed = false;
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { subscriptionStatus: true, subscriptionEndsAt: true },
    });
    isSubscribed = hasActiveSubscription(user ?? undefined);
  }

  const items = await getPublicCaseStudies(30);

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
              <Link href="/wins">
                <Button variant="outline" size="sm">
                  Speed wins
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

      <main className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-50">
          Case studies
        </h1>
        <p className="mt-2 text-sm text-zinc-400 max-w-xl">
          Approved, auditable examples of how prices reacted after classified catalysts.
          These measure classification quality — not guaranteed profits.
        </p>

        {items.length === 0 ? (
          <p className="mt-10 text-sm text-zinc-500">
            No approved case studies yet. Examples appear here only after manual approval
            with source evidence.
          </p>
        ) : (
          <ul className="mt-8 space-y-4">
            {items.map((item) => (
              <li
                key={`${item.kind}-${item.id}`}
                className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono font-bold text-emerald-400">{item.symbol}</span>
                  {item.catalystType && (
                    <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                      {item.catalystType}
                    </span>
                  )}
                  <span className="text-[10px] text-zinc-600 ml-auto">
                    {item.checkpointLabel}
                  </span>
                </div>
                <p className="mt-1 text-sm text-zinc-200">{item.headline}</p>
                <p className="mt-2 text-xs text-zinc-400">{item.whatHappened}</p>
                <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-mono text-zinc-500">
                  {item.priceAtIngest != null && (
                    <span>@ ingest ${item.priceAtIngest.toFixed(2)}</span>
                  )}
                  {item.priceLater != null && (
                    <span>later ${item.priceLater.toFixed(2)}</span>
                  )}
                  {item.rawReturnPct != null && (
                    <span
                      className={
                        item.rawReturnPct >= 0 ? "text-emerald-400" : "text-red-400"
                      }
                    >
                      {item.rawReturnPct >= 0 ? "+" : ""}
                      {item.rawReturnPct.toFixed(2)}%
                    </span>
                  )}
                  <span>{item.source}</span>
                </div>
                {item.evidence.length > 0 && (
                  <ul className="mt-2 text-[10px] text-zinc-600 list-disc pl-4">
                    {item.evidence.slice(0, 4).map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                )}
                {item.sourceUrl && (
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-2 text-[11px] text-sky-400 hover:underline"
                  >
                    Source evidence →
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-10 text-[11px] text-zinc-600">{CALIBRATION_DISCLAIMER}</p>
        <DisclaimerBanner />
      </main>
    </div>
  );
}
