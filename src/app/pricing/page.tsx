import Link from "next/link";
import { Zap, Check, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
const SUBSCRIPTION_PRICE = 40;

const included = [
  "Live catalyst scanner with 30s refresh",
  "Discord webhook alerts",
  "Smart keyword sentiment scoring (-100 to +100)",
  "Float, market cap, and volume on every ticker",
  "Premarket mover detection",
  "Historical similar-catalyst move data",
  "Discord webhook alerts (free)",
  "Advanced filters (catalyst type, urgency, sentiment)",
  "Sound alerts for new catalysts",
  "Watchlist support",
  "Cancel anytime",
];

export default function PricingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-zinc-800 px-4 sm:px-6 h-16 flex items-center">
        <Link href="/" className="flex items-center gap-2 text-zinc-400 hover:text-zinc-100 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-black" />
            </div>
            <span className="font-bold">TickerTrust</span>
          </div>
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="max-w-lg w-full">
          <div className="text-center mb-10">
            <h1 className="text-3xl sm:text-4xl font-bold mb-3">Simple, transparent pricing</h1>
            <p className="text-zinc-400">One plan. Everything included. No hidden fees.</p>
          </div>

          <div className="rounded-2xl border border-emerald-500/30 bg-zinc-900/50 p-8 glow-emerald relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-emerald-500 text-black text-xs font-bold px-4 py-1 rounded-bl-lg">
              MOST POPULAR
            </div>

            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-1">Pro Trader</h2>
              <p className="text-sm text-zinc-400">Full access to everything</p>
            </div>

            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-5xl font-bold">${SUBSCRIPTION_PRICE}</span>
              <span className="text-zinc-400">/month</span>
            </div>
            <p className="text-sm text-emerald-400 mb-8">7-day free trial included</p>

            <Link href="/login?register=true" className="block mb-8">
              <Button size="lg" className="w-full text-base">
                Start Free Trial
              </Button>
            </Link>

            <ul className="space-y-3">
              {included.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-zinc-300">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8">
            <DisclaimerBanner compact />
          </div>
        </div>
      </main>
    </div>
  );
}
