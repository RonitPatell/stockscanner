import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import {
  NASDAQ_HALT_CODES,
  HALT_CODES_DISCLAIMER,
} from "@/lib/halt-monitor/codes";

export const dynamic = "force-static";

export const metadata = {
  title: "Stock Halt Codes Explained — TrustTicker",
  description:
    "Plain-language guide to Nasdaq halt codes (T1, T2, T5, regulatory). Educational only — not trading advice.",
};

export default function HaltCodesPage() {
  return (
    <div className="marketing-shell min-h-screen">
      <header className="sticky top-0 z-40 border-b mk-hairline bg-[rgba(9,8,7,0.72)] backdrop-blur-xl px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
          <LogoMark className="w-7 h-7" />
          <span className="font-semibold tracking-tight">
            Trust<span className="text-emerald-400">Ticker</span>
          </span>
        </Link>
        <Link href="/case-studies" className="text-sm text-zinc-400 hover:text-zinc-200">
          Case studies
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-400/80 mb-3">
          Exchange literacy
        </p>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-zinc-50">
          Halt codes, explained
        </h1>
        <p className="mt-3 text-zinc-400 leading-relaxed max-w-2xl">
          When a stock stops trading, the listing exchange publishes a halt code.
          TrustTicker surfaces official status when configured — we never invent a
          resumption time. If the exchange has not announced one, we show{" "}
          <span className="text-zinc-200">not yet announced</span>.
        </p>

        <div className="mt-6 rounded border border-amber-900/40 bg-amber-950/25 px-4 py-3 text-sm text-amber-100/90">
          {HALT_CODES_DISCLAIMER}
        </div>

        <section className="mt-10 space-y-4">
          {NASDAQ_HALT_CODES.map((c) => (
            <article
              key={c.code}
              className="rounded border border-zinc-800 bg-zinc-950/50 px-4 py-4"
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-lg font-semibold text-emerald-300">
                  {c.code}
                </span>
                <span className="text-zinc-100 font-medium">{c.title}</span>
                <span className="text-[10px] uppercase tracking-wide text-zinc-500 border border-zinc-700 px-1.5 py-0.5 rounded">
                  {c.category}
                </span>
              </div>
              <p className="mt-2 text-sm text-zinc-300 leading-relaxed">
                {c.explanation}
              </p>
              <p className="mt-2 text-xs text-zinc-500">
                Typical next step: {c.typicalNext}
              </p>
            </article>
          ))}
        </section>

        <section className="mt-12 space-y-3 text-sm text-zinc-400">
          <h2 className="text-zinc-200 font-medium">What TrustTicker will / will not do</h2>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>Alert on HALTED, NEWS_RELEASED, RESUMPTION_QUOTE_SCHEDULED, RESUMED, REHALTED when an official or licensed feed is configured.</li>
            <li>Prefer the listing exchange over a market-data LULD feed when they disagree.</li>
            <li>Never estimate quote or trade resumption clocks.</li>
            <li>Never suggest buying or selling around a halt.</li>
          </ul>
        </section>

        <div className="mt-10">
          <DisclaimerBanner />
        </div>
      </main>
    </div>
  );
}
