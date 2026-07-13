import Link from "next/link";

export const metadata = {
  title: "Terms of Service — TrustTicker",
  description: "Terms of Service for TrustTicker.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 px-4 sm:px-6 h-14 flex items-center">
        <Link href="/" className="text-emerald-400 hover:underline text-sm">
          ← Back to TrustTicker
        </Link>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
        <p className="text-xs text-zinc-500 mb-8">Last updated: July 12, 2026</p>

        <div className="space-y-5 text-sm text-zinc-300 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">1. Acceptance of Terms</h2>
            <p>
              By accessing TrustTicker, you agree to these Terms of Service and our{" "}
              <Link href="/legal/privacy" className="text-emerald-400 hover:underline">
                Privacy Policy
              </Link>
              ,{" "}
              <Link href="/legal/cookies" className="text-emerald-400 hover:underline">
                Cookie Policy
              </Link>
              , and{" "}
              <Link href="/legal/disclaimer" className="text-emerald-400 hover:underline">
                Disclaimer
              </Link>
              . If you do not agree, do not use the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">2. Service Description</h2>
            <p>
              TrustTicker provides an informational market-news workspace, research tools, and
              optional alert services on a subscription basis. Pricing is shown on the pricing page
              (including monthly and annual options when offered). The service is for informational
              purposes only and does not constitute investment, trading, or financial advice.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">3. Eligibility</h2>
            <p>
              You must be at least 18 years old and able to form a binding contract. You are
              responsible for the accuracy of registration information (including phone number where
              required) and for keeping your login credentials confidential.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">4. Subscription &amp; Billing</h2>
            <p>
              Paid plans are billed through Stripe. A free trial may be offered subject to
              eligibility (including one-trial limits we enforce). You may cancel anytime via the
              Stripe billing portal in Settings. Unless stated otherwise at checkout, no refunds for
              partial periods. After canceling, access may continue until the end of the paid/trial
              period already started.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">5. Account Deletion</h2>
            <p>
              You may delete your account from Settings if you do not have an active, trialing, or
              past-due subscription. If you are subscribed, cancel the subscription first in Manage
              billing; then return to Settings to delete the account. Deletion is permanent and
              removes personal account data as described in the Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">6. User Responsibilities</h2>
            <p>
              You are solely responsible for your own trading and investment decisions. You agree
              not to redistribute TrustTicker proprietary product data in a way that substitutes for
              a subscription, not to abuse rate limits or security controls, and not to use the
              service for unlawful purposes. News content remains owned by original publishers.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">7. Acceptable Use</h2>
            <p>
              You may not attempt to bypass paywalls, scrape the service at abusive scale, probe for
              vulnerabilities except through responsible disclosure to us, spam the Call Board, or
              interfere with other users. We may suspend or terminate accounts that violate these
              Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">8. Intellectual Property</h2>
            <p>
              Platform software, design, and original product features are owned by TrustTicker.
              Third-party news, marks, and data belong to their respective owners.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">9. Disclaimers</h2>
            <p>
              The service is provided &quot;as is&quot; without warranties of any kind. Market data
              and alerts may be delayed, incomplete, or inaccurate. See our Disclaimer for full risk
              language. Nothing on TrustTicker is a recommendation to buy or sell securities.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">10. Limitation of Liability</h2>
            <p>
              To the fullest extent permitted by law, TrustTicker is not liable for trading losses,
              missed alerts, data errors, or service interruptions. Our total liability for any
              claim relating to the service is limited to the amount you paid us in the twelve (12)
              months before the claim.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">11. Indemnity</h2>
            <p>
              You agree to indemnify and hold TrustTicker harmless from claims arising out of your
              use of the service, your trading decisions, or your violation of these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">12. Termination</h2>
            <p>
              We may suspend or terminate access for violations of these Terms or for operational
              reasons. You may stop using the service, cancel billing, and delete your account as
              described above.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">13. Governing Law</h2>
            <p>
              These terms are governed by the laws of the United States (without regard to conflict
              of law rules), except where mandatory local consumer law applies. Disputes shall be
              resolved through binding arbitration on an individual basis where permitted by law;
              you waive class actions to the extent allowed.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">14. Changes</h2>
            <p>
              We may update these Terms. The &quot;Last updated&quot; date will change when we do.
              Continued use after changes constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">15. Contact</h2>
            <p>
              Questions:{" "}
              <a href="mailto:privacy@trustticker.com" className="text-emerald-400 hover:underline">
                privacy@trustticker.com
              </a>
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
