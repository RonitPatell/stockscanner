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
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: Radio,
    title: "Live Catalyst Feed",
    description:
      "Breaking news hits your scanner within seconds. No refresh needed — SSE live stream keeps you ahead.",
  },
  {
    icon: Brain,
    title: "Smart Sentiment Analysis",
    description:
      "Every headline gets instant keyword-based sentiment scoring (-100 to +100) and catalyst classification.",
  },
  {
    icon: TrendingUp,
    title: "Historical Context",
    description:
      "See how similar catalysts moved stocks historically. 'FDA approvals averaged +18.5% move' — context that matters.",
  },
  {
    icon: Clock,
    title: "Premarket Movers",
    description:
      "Catch momentum before the bell. Premarket catalysts flagged automatically so you never miss the open.",
  },
  {
    icon: BarChart3,
    title: "Float & Market Cap",
    description:
      "Instant float and market cap on every ticker. Know if a catalyst can actually move the stock.",
  },
  {
    icon: Bell,
    title: "Discord Alerts",
    description:
      "High-urgency catalysts pushed to your Discord webhook instantly. Free to set up.",
  },
];

const comparisons = [
  "Answers 'what just happened?' not just 'what moved?'",
  "Smart sentiment scoring on every headline",
  "Historical similar-catalyst move data",
  "Float + market cap on every card",
  "Sub-30-second live feed updates",
  "Discord alert channels",
];

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <Navbar />

      {/* Hero */}
      <section className="relative pt-32 pb-20 px-4 sm:px-6 overflow-hidden">
        <div className="absolute inset-0 grid-bg" />
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-emerald-500/10 rounded-full blur-[120px]" />

        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-sm mb-8">
            <Zap className="w-4 h-4" />
            Live catalyst scanner for serious traders
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
            What stocks just got news
            <br />
            <span className="text-emerald-400">that actually matters?</span>
          </h1>

          <p className="text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            TickerTrust scans breaking news in real-time, scores sentiment with AI,
            and shows you momentum before the crowd catches on. Built for day traders
            and swing traders who need an edge.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
            <Link href="/pricing">
              <Button size="lg" className="text-base px-8">
                Start 7-Day Free Trial <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="outline" size="lg" className="text-base px-8">
                View Live Demo
              </Button>
            </Link>
          </div>

          <p className="text-sm text-zinc-600">$40/month after trial · Cancel anytime</p>
        </div>

        {/* Demo preview card */}
        <div className="relative max-w-3xl mx-auto mt-16 glow-emerald">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-xl p-1 shadow-2xl">
            <div className="rounded-xl bg-zinc-950 p-4 sm:p-6 space-y-3">
              <DemoCatalyst
                symbol="MRNA"
                change="+16.94%"
                headline="Phase 3 Trial Shows 94% Efficacy, FDA Fast Track Granted"
                sentiment={82}
                type="FDA / Biotech"
                historical="+18.5% avg"
              />
              <DemoCatalyst
                symbol="AMD"
                change="+5.82%"
                headline="Wins $2.1B Data Center Contract From Hyperscaler"
                sentiment={71}
                type="Contract Win"
                historical="+12.3% avg"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-4 sm:px-6 border-t border-zinc-800/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Built different from every other scanner
            </h2>
            <p className="text-zinc-400 max-w-xl mx-auto">
              Screeners show you what moved. TickerTrust tells you why — and whether it matters.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 hover:border-zinc-700 transition-colors group"
              >
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-4 group-hover:bg-emerald-500/20 transition-colors">
                  <feature.icon className="w-5 h-5 text-emerald-400" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why us */}
      <section className="py-24 px-4 sm:px-6 bg-zinc-900/30">
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold mb-6">Why traders switch to TickerTrust</h2>
              <ul className="space-y-3">
                {comparisons.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-zinc-300">
                    <Check className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 space-y-4">
              <div className="flex items-center gap-2 text-amber-400">
                <Shield className="w-5 h-5" />
                <span className="font-semibold">Legal & Compliant</span>
              </div>
              <p className="text-sm text-zinc-400 leading-relaxed">
                TickerTrust is an informational data platform. We provide market data,
                news aggregation, and AI-generated sentiment indicators — not investment
                advice. Every page includes clear disclaimers. Historical move data
                includes sample sizes and past-performance warnings.
              </p>
              <Link href="/legal/disclaimer" className="text-sm text-emerald-400 hover:underline">
                Read full disclaimer →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Get the edge. Start today.</h2>
          <p className="text-zinc-400 mb-8">
            7-day free trial. Full access to live scanner, AI analysis, and alerts.
          </p>
          <Link href="/pricing">
            <Button size="lg" className="text-base px-10">
              Start Free Trial — $40/mo after
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-8 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <DisclaimerBanner compact />
          <div className="flex flex-col sm:flex-row items-center justify-between mt-6 gap-4 text-sm text-zinc-600">
            <span>© {new Date().getFullYear()} TickerTrust. All rights reserved.</span>
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
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-left">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-lg">{symbol}</span>
          <span className="text-xs px-2 py-0.5 rounded bg-violet-500/15 text-violet-400 border border-violet-500/30">
            {type}
          </span>
        </div>
        <span className="font-mono text-emerald-400 font-medium">{change}</span>
      </div>
      <p className="text-sm text-zinc-300 mb-2">{headline}</p>
      <div className="flex items-center gap-4 text-xs text-zinc-500">
        <span>
          Sentiment: <span className="text-emerald-400 font-mono">{sentiment}/100</span>
        </span>
        <span>Similar news: <span className="text-emerald-400">{historical}</span></span>
      </div>
    </div>
  );
}
