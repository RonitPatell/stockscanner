import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 px-4 sm:px-6 h-14 flex items-center">
        <Link href="/" className="text-emerald-400 hover:underline text-sm">← Back to TrustTicker</Link>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-8">Terms of Service</h1>
        <div className="space-y-4 text-sm text-zinc-300 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">1. Acceptance of Terms</h2>
            <p>By accessing TrustTicker, you agree to these Terms of Service and our Privacy Policy and Disclaimer.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">2. Service Description</h2>
            <p>
              TrustTicker provides informational market data, news aggregation, AI-generated analysis,
              and alert services on a subscription basis ($40 USD/month). The service is for
              informational purposes only and does not constitute investment advice.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">3. Subscription & Billing</h2>
            <p>
              Subscriptions are billed monthly through Stripe. A 7-day free trial may be offered.
              You may cancel at any time through the billing portal. No refunds for partial months.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">4. User Responsibilities</h2>
            <p>
              You are responsible for your own trading decisions. You agree not to redistribute
              TrustTicker data or use the service for any unlawful purpose. You must be 18 or older.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">5. Limitation of Liability</h2>
            <p>
              TrustTicker is provided &quot;as is&quot; without warranties. We are not liable for any
              trading losses, data inaccuracies, missed alerts, or service interruptions. Our total
              liability is limited to the amount you paid in the prior 12 months.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">6. Intellectual Property</h2>
            <p>All platform content, design, and algorithms are owned by TrustTicker. News content belongs to original publishers.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">7. Termination</h2>
            <p>We may suspend or terminate accounts that violate these terms. You may cancel your subscription at any time.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">8. Governing Law</h2>
            <p>These terms are governed by the laws of the United States. Disputes shall be resolved through binding arbitration.</p>
          </section>
        </div>
        <p className="text-xs text-zinc-600 mt-12">Last updated: {new Date().toLocaleDateString()}</p>
      </main>
    </div>
  );
}
