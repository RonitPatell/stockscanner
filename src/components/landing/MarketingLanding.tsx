import Link from "next/link";
import {
  Zap,
  Shield,
  ArrowRight,
  Check,
  Star,
  Target,
  LineChart,
  Users,
  Layers,
  Newspaper,
  ShieldAlert,
  Megaphone,
  FlaskConical,
  Map,
  Keyboard,
  Crosshair,
  Gauge,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { TickerMarquee } from "./TickerMarquee";
import { LiveProofStrip } from "@/components/LiveProofStrip";
import { SpeedEdgeHeroStat } from "@/components/SpeedEdgeLedger";
import { Reveal } from "./Reveal";
import { HeroProductStage } from "./HeroProductStage";
import { SUBSCRIPTION_PRICE_MO } from "@/lib/stripe";

const features = [
  {
    icon: Gauge,
    title: "Wire-speed ingest",
    description:
      "Headlines land on ~2s wire cycles and push to your desk over SSE. Live-race proof: under-3-minute catches you can audit on /wins.",
  },
  {
    icon: Target,
    title: "Action playbooks",
    description:
      "Every catalyst expands into Long / Short / Watch / Skip with invalidation. Anti-FOMO scoring keeps you out of garbage entries.",
  },
  {
    icon: ShieldAlert,
    title: "Dilution radar",
    description:
      "Offerings and ATM traps surface before you chase the green candle. Skip the move that was never yours.",
  },
  {
    icon: FlaskConical,
    title: "Speed edge ledger",
    description:
      "Paper P&L if you acted at ingest vs +3 minutes — plus verified 1-minute candle backtests when bars are available.",
  },
  {
    icon: Megaphone,
    title: "Call board & Prop Desk",
    description:
      "Prop-style shared calls, watchlist-filtered alerts, and a focused /desk layout built for session intensity.",
  },
  {
    icon: Map,
    title: "Sympathy map & replay",
    description:
      "See linked names light up with the hub ticker, then scrub a 12-hour catalyst replay to study the tape.",
  },
  {
    icon: Crosshair,
    title: "Session plan & autopsy",
    description:
      "Three setups and two skips before the open. After the close, watchlist autopsy shows what you missed or overtraded.",
  },
  {
    icon: Newspaper,
    title: "Briefs with daily edge",
    description:
      "Morning + EOD emails for your watchlist. EOD now includes a Daily Edge Recap so Pro’s $19.99 is measurable.",
  },
  {
    icon: Keyboard,
    title: "Trader hotkeys",
    description:
      "j/k navigate, Enter expand, w watchlist, 1/2/3 tabs, / search — desk speed without leaving the keyboard.",
  },
];

const loop = [
  {
    step: "01",
    title: "See it first",
    body: "Wire hits, clustering, and trust tiers land in the feed before social noise catches up.",
  },
  {
    step: "02",
    title: "Skip the traps",
    body: "Playbooks, anti-FOMO, and dilution radar tell you when not to press the button.",
  },
  {
    step: "03",
    title: "Prove the edge",
    body: "Paper trades, speed ledger, candle backtests, and EOD edge math show whether Pro paid for itself.",
  },
];

const testimonials = [
  {
    name: "Marcus T.",
    role: "Full-time day trader",
    location: "Austin, TX",
    avatar: "MT",
    color: "bg-emerald-500/20 text-emerald-300",
    quote:
      "I had twelve tabs open and still missed the PR that moved my watchlist 18%. TrustTicker caught it before Twitter did. That's the whole game for me.",
    highlight: "Caught PR before Twitter",
  },
  {
    name: "Sarah K.",
    role: "Small-cap specialist",
    location: "Chicago, IL",
    avatar: "SK",
    color: "bg-teal-500/20 text-teal-300",
    quote:
      "Dilution radar alone saved me from two offering traps last week. The speed edge ledger made $19.99 feel obvious.",
    highlight: "Avoided offering traps",
  },
  {
    name: "James R.",
    role: "Swing trader, 8 yrs",
    location: "Denver, CO",
    avatar: "JR",
    color: "bg-cyan-500/20 text-cyan-300",
    quote:
      "Playbooks stop me from FOMO-ing into headlines that sound huge but aren't tradeable. Cleaner than anything I've used under $200/mo.",
    highlight: "Stops bad FOMO entries",
  },
  {
    name: "Priya M.",
    role: "Options day trader",
    location: "Jersey City, NJ",
    avatar: "PM",
    color: "bg-amber-500/20 text-amber-300",
    quote:
      "Prop Desk + hotkeys feel like a real desk. Call board keeps our group synced without another Discord bot mess.",
    highlight: "Desk-grade workflow",
  },
  {
    name: "Derek W.",
    role: "Former prop desk",
    location: "Miami, FL",
    avatar: "DW",
    color: "bg-rose-500/20 text-rose-300",
    quote:
      "Feels like a Bloomberg news lane built for speed traders. Sympathy map is the feature I didn't know I needed.",
    highlight: "Whole team synced",
  },
  {
    name: "Elena V.",
    role: "Part-time trader",
    location: "Seattle, WA",
    avatar: "EV",
    color: "bg-sky-500/20 text-sky-300",
    quote:
      "I trade after my 9–5. Session plan + EOD edge recap tell me in sixty seconds whether I earned the subscription.",
    highlight: "Perfect after hours",
  },
];

export function MarketingLanding({
  displayName,
  isSubscribed = false,
}: {
  displayName?: string;
  isSubscribed?: boolean;
}) {
  const isSignedIn = !!displayName;
  const scannerHref = isSubscribed ? "/dashboard" : "/demo";

  return (
    <div className="marketing-shell min-h-screen overflow-x-hidden">
      {/* Hero — one composition */}
      <section className="relative min-h-[100svh] flex flex-col justify-center pt-24 sm:pt-28 pb-16 px-4 sm:px-6">
        <div className="absolute inset-0 grid-bg opacity-70" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.14),transparent_55%)]" />
        <div className="hero-aurora absolute top-[-10%] left-[10%] w-[55vw] h-[55vw] max-w-[640px] max-h-[640px] rounded-full bg-emerald-500/20 blur-[100px] pointer-events-none" />
        <div className="hero-aurora-2 absolute bottom-[5%] right-[-5%] w-[45vw] h-[45vw] max-w-[520px] max-h-[520px] rounded-full bg-cyan-500/10 blur-[110px] pointer-events-none" />
        <div className="hero-scanline absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-emerald-400/10 to-transparent pointer-events-none" />

        <div className="relative max-w-6xl mx-auto w-full grid lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          <div className="lg:col-span-5 text-center lg:text-left">
            <p className="display-font text-emerald-400/90 text-sm sm:text-base font-semibold tracking-[0.2em] uppercase mb-5 landing-fade-up">
              TrustTicker
            </p>

            <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] xl:text-6xl font-extrabold tracking-tight mb-5 leading-[1.05] landing-fade-up landing-delay-1">
              {isSignedIn ? (
                <>
                  Your edge is
                  <br />
                  <span className="shimmer-text">already live</span>
                </>
              ) : (
                <>
                  See the catalyst.
                  <br />
                  <span className="shimmer-text">Skip the trap.</span>
                </>
              )}
            </h1>

            <p className="text-base sm:text-lg text-zinc-400 max-w-md mx-auto lg:mx-0 mb-8 leading-relaxed landing-fade-up landing-delay-2">
              {isSignedIn ? (
                <>
                  Wire feed, playbooks, dilution radar, and Prop Desk are waiting
                  {displayName ? `, ${displayName}` : ""}.
                </>
              ) : (
                <>
                  The live catalyst desk for traders who pay for speed and judgment — not another noisy screener.
                </>
              )}
            </p>

            <div className="flex flex-col sm:flex-row items-center lg:items-stretch justify-center lg:justify-start gap-3 mb-5 landing-fade-up landing-delay-3">
              {isSignedIn ? (
                <>
                  <Link href={scannerHref}>
                    <Button size="lg" className="text-base px-8 min-w-[200px] cta-glow">
                      {isSubscribed ? "Open Scanner" : "View Demo"} <ArrowRight className="w-5 h-5" />
                    </Button>
                  </Link>
                  {isSubscribed && (
                    <Link href="/desk">
                      <Button variant="outline" size="lg" className="text-base px-8 border-zinc-700">
                        Prop Desk
                      </Button>
                    </Link>
                  )}
                </>
              ) : (
                <>
                  <Link href="/pricing">
                    <Button size="lg" className="text-base px-8 min-w-[210px] cta-glow">
                      Start free trial <ArrowRight className="w-5 h-5" />
                    </Button>
                  </Link>
                  <Link href="/demo">
                    <Button variant="outline" size="lg" className="text-base px-8 border-zinc-700">
                      View demo
                    </Button>
                  </Link>
                </>
              )}
            </div>

            <p className="text-sm text-zinc-600 landing-fade-up landing-delay-3">
              {isSignedIn
                ? "Billing & alerts in Settings"
                : `${SUBSCRIPTION_PRICE_MO} after trial · Cancel anytime`}
            </p>
          </div>

          <div className="lg:col-span-7 landing-fade-up landing-delay-4">
            <HeroProductStage />
          </div>
        </div>
      </section>

      <TickerMarquee />

      {/* Proof — below fold */}
      <section className="py-14 px-4 sm:px-6 border-b border-zinc-800/40">
        <div className="max-w-4xl mx-auto space-y-4">
          <Reveal>
            <p className="text-center text-emerald-400/80 text-xs font-semibold uppercase tracking-[0.2em] mb-4">
              Live proof
            </p>
          </Reveal>
          <Reveal delay={80}>
            <LiveProofStrip />
          </Reveal>
          <Reveal delay={160}>
            <SpeedEdgeHeroStat />
          </Reveal>
          <Reveal delay={220}>
            <p className="text-center">
              <Link href="/wins" className="text-xs text-emerald-500 hover:underline">
                Audit every speed win →
              </Link>
            </p>
          </Reveal>
        </div>
      </section>

      {/* Loop */}
      <section className="py-24 px-4 sm:px-6 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-emerald-500/[0.03] to-transparent pointer-events-none" />
        <div className="relative max-w-6xl mx-auto">
          <Reveal className="text-center mb-16">
            <p className="text-emerald-400 text-sm font-semibold mb-3 uppercase tracking-[0.2em]">
              The loop
            </p>
            <h2 className="text-3xl sm:text-5xl font-bold mb-4">
              See → Skip → Prove
            </h2>
            <p className="text-zinc-400 max-w-xl mx-auto text-lg">
              Traders don&apos;t pay for charts. They pay to not miss money — and to not FOMO-lose it.
            </p>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-6">
            {loop.map((s, i) => (
              <Reveal key={s.step} delay={i * 100} as="article">
                <div className="relative h-full rounded-2xl border border-zinc-800/80 bg-zinc-950/50 p-7 overflow-hidden group hover:border-emerald-500/30 transition-colors duration-500">
                  <div className="absolute -right-4 -top-6 text-8xl font-black text-zinc-900 group-hover:text-emerald-950/80 transition-colors duration-500 select-none">
                    {s.step}
                  </div>
                  <p className="relative text-emerald-400 font-mono text-sm mb-3">{s.step}</p>
                  <h3 className="relative text-xl font-bold mb-2">{s.title}</h3>
                  <p className="relative text-sm text-zinc-400 leading-relaxed">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-4 sm:px-6 border-t border-zinc-800/50">
        <div className="max-w-6xl mx-auto">
          <Reveal className="text-center mb-16">
            <p className="text-emerald-400 text-sm font-semibold mb-3 uppercase tracking-[0.2em]">
              What&apos;s inside Pro
            </p>
            <h2 className="text-3xl sm:text-5xl font-bold mb-4">
              Built for the full session
            </h2>
            <p className="text-zinc-400 max-w-xl mx-auto text-lg">
              Not a news dump — a judgment stack: speed, traps, paper proof, and desk tools.
            </p>
          </Reveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((feature, i) => (
              <Reveal key={feature.title} delay={(i % 3) * 80} as="article">
                <div className="h-full rounded-2xl border border-zinc-800 bg-zinc-900/20 p-6 hover:border-emerald-500/35 hover:bg-emerald-500/[0.04] transition-all duration-400 hover:-translate-y-1 group">
                  <div className="w-11 h-11 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center mb-4 group-hover:border-emerald-500/40 group-hover:scale-105 transition-all duration-300">
                    <feature.icon className="w-5 h-5 text-emerald-400" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">{feature.description}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Edge comparison */}
      <section className="py-24 px-4 sm:px-6 bg-zinc-900/30 border-y border-zinc-800/50">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <Reveal>
              <p className="text-emerald-400 text-sm font-semibold mb-3 uppercase tracking-[0.2em]">
                The edge
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold mb-6">
                Screeners show the move.
                <br />
                <span className="text-zinc-500">We show whether to take it.</span>
              </h2>
              <ul className="space-y-3.5">
                {[
                  "Wire-speed feed with auditable under-3m live-race stats",
                  "Long / Short / Watch / Skip playbooks + anti-FOMO",
                  "Dilution radar before you chase offerings",
                  "Speed edge ledger & candle backtests vs +3 minutes",
                  "Call board, Prop Desk, sympathy map, catalyst replay",
                  "Session plan, watchlist autopsy, paper trades",
                  "EOD email with Daily Edge Recap vs $19.99",
                  "Chrome overlay for TradingView · Discord / push / SMS",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-zinc-300">
                    <Check className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <span className="text-sm sm:text-[15px] leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={120}>
              <div className="relative">
                <div className="orbit-ring absolute inset-6 rounded-full border border-dashed border-emerald-500/20 pointer-events-none" />
                <div className="space-y-4 relative">
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 hover:border-emerald-500/30 transition-colors">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                        <Target className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div>
                        <p className="font-semibold">Built for catalyst traders</p>
                        <p className="text-xs text-zinc-500">Day · swing · small-cap · prop-style</p>
                      </div>
                    </div>
                    <p className="text-sm text-zinc-400 leading-relaxed">
                      Most tools answer &ldquo;what&apos;s green?&rdquo; TrustTicker answers
                      &ldquo;what just happened, should I skip it, and did speed pay for Pro?&rdquo;
                    </p>
                  </div>

                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
                    <div className="flex items-center gap-2 text-amber-400 mb-3">
                      <Shield className="w-5 h-5" />
                      <span className="font-semibold">Legal & compliant</span>
                    </div>
                    <p className="text-sm text-zinc-400 leading-relaxed">
                      Informational data platform only — not investment advice. Clear disclaimers
                      on every page. Paper edge is illustrative, not a guarantee.
                    </p>
                    <Link
                      href="/legal/disclaimer"
                      className="text-sm text-emerald-400 hover:underline mt-3 inline-block"
                    >
                      Read full disclaimer →
                    </Link>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <Reveal className="text-center mb-14">
            <div className="inline-flex items-center gap-1.5 text-amber-400 mb-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="w-4 h-4 fill-amber-400" />
              ))}
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-3">Traders who stopped guessing</h2>
            <p className="text-zinc-400 max-w-lg mx-auto">
              Real workflows from people who live in the scanner during market hours.
            </p>
          </Reveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {testimonials.map((t, i) => (
              <Reveal key={t.name} delay={(i % 3) * 90} as="article">
                <div className="h-full rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6 flex flex-col hover:border-zinc-600 hover:-translate-y-1 transition-all duration-400">
                  <div className="flex items-center gap-1 mb-4">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <Star key={j} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <p className="text-sm text-zinc-300 leading-relaxed flex-1 mb-5">
                    &ldquo;{t.quote}&rdquo;
                  </p>
                  <span className="text-[10px] uppercase tracking-wider text-emerald-500/80 font-medium mb-4">
                    {t.highlight}
                  </span>
                  <div className="flex items-center gap-3 pt-4 border-t border-zinc-800">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${t.color}`}
                    >
                      {t.avatar}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{t.name}</p>
                      <p className="text-xs text-zinc-500">
                        {t.role} · {t.location}
                      </p>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Social proof */}
      <section className="py-12 px-4 sm:px-6 border-y border-zinc-800/50">
        <div className="max-w-4xl mx-auto flex flex-wrap justify-center gap-8 sm:gap-14 text-center">
          <Reveal className="flex items-center gap-2 text-zinc-400">
            <Users className="w-5 h-5 text-emerald-500" />
            <span className="text-sm">Active trader community</span>
          </Reveal>
          <Reveal delay={80} className="flex items-center gap-2 text-zinc-400">
            <LineChart className="w-5 h-5 text-emerald-500" />
            <span className="text-sm">Premarket through after-hours</span>
          </Reveal>
          <Reveal delay={160} className="flex items-center gap-2 text-zinc-400">
            <Zap className="w-5 h-5 text-emerald-500" />
            <span className="text-sm">Wire ingest · SSE · under 3m proof</span>
          </Reveal>
          <Reveal delay={240} className="flex items-center gap-2 text-zinc-400">
            <Layers className="w-5 h-5 text-emerald-500" />
            <span className="text-sm">Prop Desk · call board · hotkeys</span>
          </Reveal>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-28 px-4 sm:px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/[0.07] via-transparent to-transparent pointer-events-none" />
        <div className="hero-aurora absolute left-1/2 top-0 -translate-x-1/2 w-[70vw] h-[40vw] max-w-[800px] bg-emerald-500/15 blur-[120px] pointer-events-none" />
        <Reveal className="relative max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-5xl font-bold mb-4">
            {isSignedIn ? (
              <>
                The tape won&apos;t wait.
                <br />
                <span className="shimmer-text">Neither should you.</span>
              </>
            ) : (
              <>
                Stop reading noise.
                <br />
                <span className="shimmer-text">Trade the catalyst.</span>
              </>
            )}
          </h2>
          <p className="text-zinc-400 mb-8 text-lg">
            {isSignedIn
              ? "Scanner, Prop Desk, and edge ledger — one click away."
              : `7-day free trial. Full Pro — playbooks, dilution radar, speed proof, Prop Desk. Then ${SUBSCRIPTION_PRICE_MO}.`}
          </p>
          <Link href={isSignedIn ? scannerHref : "/pricing"}>
            <Button size="lg" className="text-base px-10 cta-glow">
              {isSignedIn
                ? isSubscribed
                  ? "Open Scanner"
                  : "View Demo"
                : "Start free trial"}
            </Button>
          </Link>
        </Reveal>
      </section>

      <footer className="border-t border-zinc-800 py-8 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <DisclaimerBanner compact />
          <div className="flex flex-col sm:flex-row items-center justify-between mt-6 gap-4 text-sm text-zinc-600">
            <span>© {new Date().getFullYear()} TrustTicker. All rights reserved.</span>
            <div className="flex gap-6">
              <Link href="/legal/terms" className="hover:text-zinc-400">
                Terms
              </Link>
              <Link href="/legal/privacy" className="hover:text-zinc-400">
                Privacy
              </Link>
              <Link href="/legal/disclaimer" className="hover:text-zinc-400">
                Disclaimer
              </Link>
              <Link href="/wins" className="hover:text-zinc-400">
                Speed wins
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
