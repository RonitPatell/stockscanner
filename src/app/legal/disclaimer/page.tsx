import Link from "next/link";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";

export default function DisclaimerPage() {
  return (
    <LegalLayout title="Disclaimer">
      <DisclaimerBanner />
      <div className="prose prose-invert prose-sm max-w-none mt-8 space-y-4 text-zinc-300">
        <h2 className="text-lg font-semibold text-white">Not Investment Advice</h2>
        <p>
          TickerTrust (&quot;we,&quot; &quot;us,&quot; &quot;our&quot;) provides an informational market data
          and news aggregation platform. Nothing on this platform constitutes investment advice,
          financial advice, trading advice, or any other sort of advice. You should not treat
          any content on TickerTrust as such.
        </p>

        <h2 className="text-lg font-semibold text-white">Automated Analysis</h2>
        <p>
          Summaries, sentiment scores, urgency scores, and catalyst classifications are generated
          by automated keyword analysis algorithms. These are informational indicators only and may
          contain errors. They are not recommendations to buy, sell, or hold any security.
        </p>

        <h2 className="text-lg font-semibold text-white">Historical Performance Data</h2>
        <p>
          Historical average move data (e.g., &quot;similar FDA news caused +18.5% average move&quot;)
          is based on aggregated historical patterns and is provided for contextual information
          only. Past performance does not guarantee future results. Market conditions, liquidity,
          and countless other factors affect actual price movements.
        </p>

        <h2 className="text-lg font-semibold text-white">No Fiduciary Relationship</h2>
        <p>
          Use of TickerTrust does not create a fiduciary, advisory, or broker-client relationship.
          We are not registered investment advisors, broker-dealers, or financial planners.
          Consult a licensed financial professional before making investment decisions.
        </p>

        <h2 className="text-lg font-semibold text-white">Risk Disclosure</h2>
        <p>
          Trading stocks involves substantial risk of loss and is not suitable for every investor.
          You may lose some or all of your invested capital. Only trade with money you can afford
          to lose. TickerTrust is not responsible for any trading losses incurred based on
          information displayed on our platform.
        </p>

        <h2 className="text-lg font-semibold text-white">Data Accuracy</h2>
        <p>
          Market data, news, float, market cap, and other figures are sourced from third-party
          providers and may be delayed or inaccurate. We make no warranties about data accuracy
          or timeliness.
        </p>

        <h2 className="text-lg font-semibold text-white">Alerts</h2>
        <p>
          Discord webhook alerts are provided as a convenience. Delivery is not guaranteed.
          Do not rely solely on alerts for trading decisions.
        </p>
      </div>
    </LegalLayout>
  );
}

function LegalLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 px-4 sm:px-6 h-14 flex items-center">
        <Link href="/" className="text-emerald-400 hover:underline text-sm">← Back to TickerTrust</Link>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-8">{title}</h1>
        {children}
        <p className="text-xs text-zinc-600 mt-12">Last updated: {new Date().toLocaleDateString()}</p>
      </main>
    </div>
  );
}

export { LegalLayout };
