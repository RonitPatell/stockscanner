import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — TrustTicker",
  description: "How TrustTicker collects, uses, and protects personal information.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 px-4 sm:px-6 h-14 flex items-center">
        <Link href="/" className="text-emerald-400 hover:underline text-sm">
          ← Back to TrustTicker
        </Link>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-xs text-zinc-500 mb-8">Last updated: July 12, 2026</p>

        <div className="space-y-6 text-sm text-zinc-300 leading-relaxed">
          <p>
            TrustTicker (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates a market-news
            and research workspace at trustticker.com (and related domains). This Privacy Policy
            explains what personal information we collect, how we use it, and your choices. The
            service is informational only and is not investment advice.
          </p>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">1. Information We Collect</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong className="text-zinc-200">Account data:</strong> email address, optional
                name, and password (stored only as a bcrypt hash — we never store plaintext
                passwords).
              </li>
              <li>
                <strong className="text-zinc-200">Phone number:</strong> required at registration
                (including for trial abuse prevention) and used for SMS alerts if you enable them.
              </li>
              <li>
                <strong className="text-zinc-200">Payment data:</strong> billed through Stripe. We
                store Stripe customer / subscription IDs and status. We do not store full card
                numbers on our servers.
              </li>
              <li>
                <strong className="text-zinc-200">Alert &amp; preference data:</strong> Discord
                webhook URL (if provided), SMS / email / Discord / push toggles, watchlist symbols,
                scanner filters, and alert rules.
              </li>
              <li>
                <strong className="text-zinc-200">Browser push:</strong> if you enable push
                notifications, we store a push subscription endpoint and keys needed to send those
                notifications.
              </li>
              <li>
                <strong className="text-zinc-200">Product activity:</strong> optional calls you post
                to the Call Board, alert delivery logs, and similar in-product actions tied to your
                account.
              </li>
              <li>
                <strong className="text-zinc-200">Technical / analytics data:</strong> IP address
                (for security and rate limiting), basic device/browser signals, and aggregated page
                analytics via Vercel Analytics. We use essential cookies / session tokens for
                authentication.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">2. How We Use Information</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Create and secure your account; prevent fraud and abuse (including login rate limits)</li>
              <li>Provide the live desk, alerts, briefs, and related product features</li>
              <li>Process subscriptions, trials, and billing through Stripe</li>
              <li>
                Send transactional messages (alerts, morning/EOD briefs, trial onboarding emails) and
                important service notices
              </li>
              <li>Operate, debug, and improve the service; understand aggregate usage</li>
              <li>Comply with law and enforce our Terms</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">3. Service Providers (Processors)</h2>
            <p className="mb-2">
              We do not sell your personal information. We share data with vendors only as needed to
              run TrustTicker, including:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong className="text-zinc-200">Stripe</strong> — payments and subscriptions
              </li>
              <li>
                <strong className="text-zinc-200">Vercel</strong> — hosting and Analytics
              </li>
              <li>
                <strong className="text-zinc-200">Database / Redis providers</strong> (e.g. Postgres
                host, Upstash) — application data and caching
              </li>
              <li>
                <strong className="text-zinc-200">Resend</strong> — transactional email
              </li>
              <li>
                <strong className="text-zinc-200">Twilio</strong> — SMS alerts (only if you enable
                SMS)
              </li>
              <li>
                <strong className="text-zinc-200">Market data / news providers</strong> (e.g.
                Finnhub and similar) — public market and news data; not used to sell your personal
                profile
              </li>
              <li>
                <strong className="text-zinc-200">Discord</strong> — if you connect a webhook, alert
                payloads are sent to the URL you provide
              </li>
            </ul>
            <p className="mt-2">
              These providers process data under their own privacy policies and our instructions as
              applicable.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">4. Data Security</h2>
            <p>
              We use HTTPS in production, bcrypt password hashing, session-based authentication,
              rate limiting on sensitive endpoints, and access controls on paid APIs. No method of
              transmission or storage is 100% secure; we cannot guarantee absolute security. You are
              responsible for keeping your password and Discord webhook URL confidential.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">5. Retention</h2>
            <p>
              We retain account and billing records while your account is active and as needed for
              subscriptions, abuse prevention, legal compliance, and dispute resolution. Alert logs
              and similar operational records may be retained for a limited period for reliability
              and support. You may request deletion as described below.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">6. Your Choices &amp; Rights</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Update alert preferences, watchlist, and webhook/phone settings in Settings</li>
              <li>Disable SMS, Discord, email, or push channels at any time</li>
              <li>Cancel your subscription via the Stripe billing portal in Settings</li>
              <li>
                <strong className="text-zinc-200">Delete your account</strong> in Settings → Danger
                zone if you do not have an active, trialing, or past-due subscription. If you are
                subscribed, cancel in Manage billing first; after the subscription is no longer
                active/trialing you can delete the account. Deletion removes your account data
                (alert logs cascade; public call-board posts may remain anonymized).
              </li>
              <li>
                You may also request access, correction, or deletion by emailing{" "}
                <a href="mailto:privacy@trustticker.com" className="text-emerald-400 hover:underline">
                  privacy@trustticker.com
                </a>
                . We may need to verify your identity before fulfilling a request.
              </li>
            </ul>
            <p className="mt-2">
              Depending on where you live (for example under GDPR or CCPA/CPRA), you may have
              additional rights such as access, deletion, or opt-out of certain processing. Contact
              us to exercise those rights. We do not sell personal information as that term is
              commonly defined under CCPA.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">7. Cookies &amp; Similar Tech</h2>
            <p>
              We use essential cookies / tokens for login sessions and privacy-oriented analytics
              via Vercel Analytics. Details are in our{" "}
              <a href="/legal/cookies" className="text-emerald-400 hover:underline">
                Cookie Policy
              </a>
              . We do not use advertising trackers to sell ads against your profile. Where shown, a
              cookie notice lets you acknowledge these practices.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">8. Children</h2>
            <p>
              TrustTicker is for users 18 and older. We do not knowingly collect personal
              information from children under 18. If you believe a minor has created an account,
              contact us and we will delete it.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">9. International Users</h2>
            <p>
              Our infrastructure may be located in the United States or other countries. If you use
              the service from elsewhere, you understand your information may be processed in
              countries that may have different data-protection laws than your own.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">10. Changes</h2>
            <p>
              We may update this Privacy Policy from time to time. The &quot;Last updated&quot; date
              at the top will change when we do. Continued use of the service after an update means
              you accept the revised policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">11. Contact</h2>
            <p>
              Privacy questions or requests:{" "}
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
