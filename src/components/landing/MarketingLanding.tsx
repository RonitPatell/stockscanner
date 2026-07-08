import Link from "next/link";
import {
  Zap,
  Brain,
  Bell,
  TrendingUp,
  Shield,
  Clock,
  BarChart3,
  Radio,
  ArrowRight,
  Check,
  Star,
  Sparkles,
  Target,
  LineChart,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { TickerMarquee } from "./TickerMarquee";

const features = [
  {
    icon: Radio,
    title: "Live Catalyst Feed",
    description:
      "Breaking PRs and wire hits land in your feed within seconds. SSE streaming — no refresh spam.",
    accent: "from-emerald-500/20 to-cyan-500/10",
  },
  {
    icon: Brain,
    title: "Sentiment Engine",
    description:
      "Every headline scored -100 to +100 with catalyst tagging. Know if news is bullish noise or real fuel.",
    accent: "from-violet-500/20 to-fuchsia-500/10",
  },
  {
    icon: TrendingUp,
    title: "Historical Context",
    description:
      "See how similar FDA wins, contracts, and upgrades moved stocks before. Pattern memory built in.",
    accent: "from-amber-500/20 to-orange-500/10",
  },
  {
    icon: Clock,
    title: "Premarket Edge",
    description:
      "Catalysts flagged before the bell so you're not chasing the 9:31 rip blind.",
    accent: "from-cyan-500/20 to-blue-500/10",
  },
  {
    icon: BarChart3,
    title: "Float & Cap Intel",
    description:
      "Float and market cap on every card. A headline on a 400M float hits different than 40M.",
    accent: "from-emerald-500/20 to-teal-500/10",
  },
  {
    icon: Bell,
    title: "Discord Alerts",
    description:
      "High-urgency catalysts ping your webhook instantly. Set it once, never miss a runner.",
    accent: "from-rose-500/20 to-pink-500/10",
  },
];

const stats = [
  { value: "<30s", label: "Avg. feed latency" },
  { value: "24/7", label: "News monitoring" },
  { value: "6+", label: "Verified sources" },
  { value: "$40", label: "Flat monthly price" },
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
    color: "bg-violet-500/20 text-violet-300",
    quote:
      "Wire alerts + heavy volume panel replaced my morning routine. I know what's actually moving before I even open my broker. Paid for itself week one.",
    highlight: "Paid for itself week one",
  },
  {
    name: "James R.",
    role: "Swing trader, 8 yrs",
    location: "Denver, CO",
    avatar: "JR",
    color: "bg-cyan-500/20 text-cyan-300",
    quote:
      "Cleaner than anything I've used under $200/mo. The sentiment score stops me from FOMO-ing into headlines that sound huge but aren't tradeable.",
    highlight: "Stops bad FOMO entries",
  },
  {
    name: "Priya M.",
    role: "Options day trader",
    location: "Jersey City, NJ",
    avatar: "PM",
    color: "bg-amber-500/20 text-amber-300",
    quote:
      "Float on every card is underrated. I stopped wasting time on catalysts that can't move the stock. My win rate on news plays went up noticeably.",
    highlight: "Better news play win rate",
  },
  {
    name: "Derek W.",
    role: "Former prop desk",
    location: "Miami, FL",
    avatar: "DW",
    color: "bg-rose-500/20 text-rose-300",
    quote:
      "Feels like a Bloomberg news lane built for speed traders. Discord webhook to my server means my whole group sees the same catalyst at the same time.",
    highlight: "Whole team synced",
  },
  {
    name: "Elena V.",
    role: "Part-time trader",
    location: "Seattle, WA",
    avatar: "EV",
    color: "bg-blue-500/20 text-blue-300",
    quote:
      "I trade after my 9–5. Premarket flags and the historical context on similar catalysts help me decide in seconds whether to size in or pass.",
    highlight: "Perfect for after-hours traders",
  },
];

const steps = [
  {
    step: "01",
    title: "News breaks",
    body: "GlobeNewswire, Business Wire, SEC filings, and market feeds get ingested and verified against real tickers.",
  },
  {
    step: "02",
    title: "AI scores it",
    body: "Sentiment, catalyst type, urgency, and float context attach to every headline in real time.",
  },
  {
    step: "03",
    title: "You react first",
    body: "Scanner, wire alerts, and Discord pings surface what matters before the crowd catches on.",
  },
];

export function MarketingLanding({ displayName }: { displayName?: string }) {
  const isSignedIn = !!displayName;

  return (
    <div className="min-h-screen overflow-x-hidden">
      {/* Hero */}
      <section className="relative pt-28 sm:pt-32 pb-16 sm:pb-24 px-4 sm:px-6">
        <div className="absolute inset-0 grid-bg" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-emerald-500/10 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute top-40 right-0 w-[400px] h-[400px] bg-violet-600/8 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative max-w-6xl mx-auto">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-sm mb-8 landing-fade-up">
              <Sparkles className="w-4 h-4" />
              {isSignedIn
                ? `Welcome back, ${displayName}`
                : "Trusted by active traders scanning every session"}
            </div>

            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6 landing-fade-up landing-delay-1">
              {isSignedIn ? (
                <>
                  Your scanner is
                  <br />
                  <span className="gradient-text">locked and loaded</span>
                </>
              ) : (
                <>
                  Catch the catalyst
                  <br />
                  <span className="gradient-text">before the crowd does</span>
                </>
              )}
            </h1>

            <p className="text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed landing-fade-up landing-delay-2">
              {isSignedIn ? (
                <>
                  Wire alerts, heavy volume, and verified catalysts are waiting. Jump into the
                  dashboard and trade the news — not the noise.
                </>
              ) : (
                <>
                  TrustTicker is a live news scanner built for traders who need the{" "}
                  <span className="text-zinc-200">why</span> behind the move — verified tickers,
                  sentiment scores, float data, and alerts that actually fire.
                </>
              )}
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8 landing-fade-up landing-delay-3">
              {isSignedIn ? (
                <>
                  <Link href="/dashboard">
                    <Button size="lg" className="text-base px-8 min-w-[220px] shadow-lg shadow-emerald-500/20">
                      Open Scanner <ArrowRight className="w-5 h-5" />
                    </Button>
                  </Link>
                  <Link href="/settings">
                    <Button variant="outline" size="lg" className="text-base px-8 min-w-[200px] border-zinc-700 hover:border-zinc-500">
                      Alert Settings
                    </Button>
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/pricing">
                    <Button size="lg" className="text-base px-8 min-w-[220px] shadow-lg shadow-emerald-500/20">
                      Start 7-Day Free Trial <ArrowRight className="w-5 h-5" />
                    </Button>
                  </Link>
                  <Link href="/dashboard">
                    <Button variant="outline" size="lg" className="text-base px-8 min-w-[200px] border-zinc-700 hover:border-zinc-500">
                      View Live Demo
                    </Button>
                  </Link>
                </>
              )}
            </div>

            <p className="text-sm text-zinc-600 landing-fade-up landing-delay-3">
              {isSignedIn
                ? "Manage billing & alerts anytime from Settings"
                : "$40/month after trial · Cancel anytime · No contracts"}
            </p>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-16 max-w-3xl mx-auto landing-fade-up landing-delay-4">
            {(isSignedIn
              ? [
                  { value: "<30s", label: "Avg. feed latency" },
                  { value: "24/7", label: "News monitoring" },
                  { value: "6+", label: "Verified sources" },
                  { value: "LIVE", label: "Scanner ready" },
                ]
              : stats
            ).map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm px-4 py-3 text-center"
              >
                <div className="text-xl sm:text-2xl font-bold text-emerald-400 font-mono">{s.value}</div>
                <div className="text-[11px] sm:text-xs text-zinc-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Product preview */}
          <div className="relative mt-16 max-w-5xl mx-auto landing-fade-up landing-delay-5">
            <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/20 via-cyan-500/10 to-violet-500/20 rounded-2xl blur-xl opacity-70" />
            <div className="relative rounded-2xl border border-zinc-700/80 bg-zinc-900/90 backdrop-blur-xl overflow-hidden shadow-2xl">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800 bg-zinc-950/80">
                <div className="flex gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                </div>
                <span className="text-[10px] text-zinc-500 font-mono ml-2">trustticker.app/dashboard</span>
                <span className="ml-auto flex items-center gap-1.5 text-[10px] text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  LIVE
                </span>
              </div>

              <div className="grid lg:grid-cols-5 gap-0 min-h-[280px]">
                <div className="lg:col-span-2 border-b lg:border-b-0 lg:border-r border-zinc-800 p-3 space-y-2">
                  <div className="text-[9px] uppercase tracking-wider text-zinc-500 font-semibold mb-2 flex items-center gap-1.5">
                    <Radio className="w-3 h-3 text-emerald-500" /> Wire Alerts
                  </div>
                  <PreviewAlert sym="BJDX" msg="High of day — +33.5%" chg="+33.5%" />
                  <PreviewAlert sym="GCTK" msg="Heavy volume — 7.1× avg" chg="+18.2%" />
                  <PreviewAlert sym="NVDA" msg="Near HOD — +4.8% today" chg="+4.8%" />
                </div>
                <div className="lg:col-span-3 p-3">
                  <div className="text-[9px] uppercase tracking-wider text-zinc-500 font-semibold mb-2 flex items-center gap-1.5">
                    <BarChart3 className="w-3 h-3 text-emerald-500" /> Live Catalyst Feed
                  </div>
                  <div className="space-y-2">
                    <DemoCatalyst
                      symbol="MRNA"
                      change="+16.94%"
                      headline="Phase 3 data shows 94% efficacy; FDA fast track granted"
                      sentiment={82}
                      type="FDA / Biotech"
                      historical="+18.5% avg"
                    />
                    <DemoCatalyst
                      symbol="AMD"
                      change="+5.82%"
                      headline="Wins $2.1B data center contract from major hyperscaler"
                      sentiment={71}
                      type="Contract Win"
                      historical="+12.3% avg"
                    />
                    <DemoCatalyst
                      symbol="PLTR"
                      change="+3.41%"
                      headline="Department of Defense extends AI analytics contract"
                      sentiment={64}
                      type="Gov Contract"
                      historical="+9.1% avg"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <TickerMarquee />

      {/* Features — bento */}
      <section id="features" className="py-24 px-4 sm:px-6 border-t border-zinc-800/50 relative">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-emerald-400 text-sm font-medium mb-3 uppercase tracking-widest">Features</p>
            <h2 className="text-3xl sm:text-5xl font-bold mb-4">
              Everything a news trader actually needs
            </h2>
            <p className="text-zinc-400 max-w-xl mx-auto text-lg">
              Not another generic screener. A catalyst command center tuned for speed.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((feature) => (
              <div
                key={feature.title}
                className={`rounded-2xl border border-zinc-800 bg-gradient-to-br ${feature.accent} p-6 hover:border-zinc-600 transition-all duration-300 hover:-translate-y-0.5 group`}
              >
                <div className="w-11 h-11 rounded-xl bg-zinc-950/60 border border-zinc-800 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                  <feature.icon className="w-5 h-5 text-emerald-400" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 px-4 sm:px-6 bg-zinc-900/40 border-y border-zinc-800/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-emerald-400 text-sm font-medium mb-3 uppercase tracking-widest">How it works</p>
            <h2 className="text-3xl sm:text-4xl font-bold">From headline to trade idea in seconds</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((s) => (
              <div key={s.step} className="relative">
                <span className="text-5xl font-black text-zinc-800 font-mono">{s.step}</span>
                <h3 className="text-xl font-semibold mt-2 mb-2">{s.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-1.5 text-amber-400 mb-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="w-4 h-4 fill-amber-400" />
              ))}
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-3">Traders who stopped guessing</h2>
            <p className="text-zinc-400 max-w-lg mx-auto">
              Real workflows from people who live in the scanner during market hours.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {testimonials.map((t) => (
              <div
                key={t.name}
                className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-6 flex flex-col hover:border-zinc-700 transition-colors"
              >
                <div className="flex items-center gap-1 mb-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-zinc-300 leading-relaxed flex-1 mb-5">&ldquo;{t.quote}&rdquo;</p>
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
            ))}
          </div>
        </div>
      </section>

      {/* Why us */}
      <section className="py-24 px-4 sm:px-6 bg-zinc-900/30 border-t border-zinc-800/50">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-emerald-400 text-sm font-medium mb-3 uppercase tracking-widest">The edge</p>
              <h2 className="text-3xl sm:text-4xl font-bold mb-6">
                Screeners show the move.
                <br />
                <span className="text-zinc-500">We show the catalyst.</span>
              </h2>
              <ul className="space-y-4">
                {[
                  "Headlines matched to the right company — not keyword noise",
                  "Sentiment + catalyst type on every headline",
                  "Historical similar-news move averages",
                  "Wire alerts, heavy volume, and HOD tracking",
                  "Discord webhooks for your trading group",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-zinc-300">
                    <Check className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                    <Target className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <p className="font-semibold">Built for catalyst traders</p>
                    <p className="text-xs text-zinc-500">Day traders · Swing traders · Small caps</p>
                  </div>
                </div>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Most tools answer &ldquo;what&apos;s green?&rdquo; TrustTicker answers &ldquo;what just
                  happened, how bullish is it, and can this float actually run?&rdquo;
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
                <div className="flex items-center gap-2 text-amber-400 mb-3">
                  <Shield className="w-5 h-5" />
                  <span className="font-semibold">Legal & compliant</span>
                </div>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Informational data platform only — not investment advice. Clear disclaimers on
                  every page. Past performance warnings on historical data.
                </p>
                <Link href="/legal/disclaimer" className="text-sm text-emerald-400 hover:underline mt-3 inline-block">
                  Read full disclaimer →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social proof bar */}
      <section className="py-12 px-4 sm:px-6 border-y border-zinc-800/50">
        <div className="max-w-4xl mx-auto flex flex-wrap justify-center gap-8 sm:gap-16 text-center">
          <div className="flex items-center gap-2 text-zinc-400">
            <Users className="w-5 h-5 text-emerald-500" />
            <span className="text-sm">Active trader community</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-400">
            <LineChart className="w-5 h-5 text-emerald-500" />
            <span className="text-sm">Premarket through after-hours</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-400">
            <Zap className="w-5 h-5 text-emerald-500" />
            <span className="text-sm">Sub-30s live updates</span>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-4 sm:px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 to-transparent pointer-events-none" />
        <div className="relative max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-5xl font-bold mb-4">
            {isSignedIn ? (
              <>
                The market won&apos;t wait.
                <br />
                <span className="gradient-text">Neither should you.</span>
              </>
            ) : (
              <>
                Stop reading news.
                <br />
                <span className="gradient-text">Start trading it.</span>
              </>
            )}
          </h2>
          <p className="text-zinc-400 mb-8 text-lg">
            {isSignedIn
              ? "Your live feed, wire alerts, and volume panel are one click away."
              : "7-day free trial. Full scanner access. Cancel anytime from Settings."}
          </p>
          <Link href={isSignedIn ? "/dashboard" : "/pricing"}>
            <Button size="lg" className="text-base px-10 shadow-lg shadow-emerald-500/25">
              {isSignedIn ? "Open Scanner" : "Start Free Trial — $40/mo after"}
            </Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-zinc-800 py-8 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <DisclaimerBanner compact />
          <div className="flex flex-col sm:flex-row items-center justify-between mt-6 gap-4 text-sm text-zinc-600">
            <span>© {new Date().getFullYear()} TrustTicker. All rights reserved.</span>
            <div className="flex gap-6">
              <Link href="/legal/terms" className="hover:text-zinc-400">Terms</Link>
              <Link href="/legal/privacy" className="hover:text-zinc-400">Privacy</Link>
              <Link href="/legal/disclaimer" className="hover:text-zinc-400">Disclaimer</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function PreviewAlert({
  sym,
  msg,
  chg,
}: {
  sym: string;
  msg: string;
  chg: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px] py-1.5 px-2 rounded bg-zinc-900/60 border border-zinc-800/80">
      <span className="font-mono font-bold text-white w-10">{sym}</span>
      <span className="text-zinc-500 truncate flex-1">{msg}</span>
      <span className="font-mono text-emerald-400 shrink-0">{chg}</span>
    </div>
  );
}

function DemoCatalyst({
  symbol,
  change,
  headline,
  sentiment,
  type,
  historical,
}: {
  symbol: string;
  change: string;
  headline: string;
  sentiment: number;
  type: string;
  historical: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-left">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold">{symbol}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400 border border-violet-500/30">
            {type}
          </span>
        </div>
        <span className="font-mono text-emerald-400 font-medium text-sm">{change}</span>
      </div>
      <p className="text-xs text-zinc-300 mb-1.5 line-clamp-1">{headline}</p>
      <div className="flex items-center gap-3 text-[10px] text-zinc-500">
        <span>
          Sentiment <span className="text-emerald-400 font-mono">{sentiment}</span>
        </span>
        <span>
          Similar <span className="text-emerald-400">{historical}</span>
        </span>
      </div>
    </div>
  );
}
