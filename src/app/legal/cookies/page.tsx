import Link from "next/link";

export const metadata = {
  title: "Cookie Policy — TrustTicker",
  description: "How TrustTicker uses cookies and similar technologies.",
};

export default function CookiePolicyPage() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 px-4 sm:px-6 h-14 flex items-center">
        <Link href="/" className="text-emerald-400 hover:underline text-sm">
          ← Back to TrustTicker
        </Link>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-2">Cookie Policy</h1>
        <p className="text-xs text-zinc-500 mb-8">Last updated: July 12, 2026</p>

        <div className="space-y-6 text-sm text-zinc-300 leading-relaxed">
          <p>
            This Cookie Policy explains how TrustTicker uses cookies and similar technologies
            when you visit our website or use the product. It should be read with our{" "}
            <Link href="/legal/privacy" className="text-emerald-400 hover:underline">
              Privacy Policy
            </Link>
            .
          </p>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">1. What are cookies?</h2>
            <p>
              Cookies are small text files stored on your device. Similar technologies include
              local storage, session storage, and pixels used for security or analytics. We use
              these to keep you signed in, protect the service, and understand how the site is used.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">2. Cookies we use</h2>
            <div className="overflow-x-auto rounded-lg border border-zinc-800">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-zinc-900 text-zinc-400">
                  <tr>
                    <th className="p-3 font-medium">Category</th>
                    <th className="p-3 font-medium">Purpose</th>
                    <th className="p-3 font-medium">Examples</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  <tr>
                    <td className="p-3 text-zinc-200 font-medium align-top">Essential</td>
                    <td className="p-3 align-top">
                      Required to sign in, stay signed in, CSRF protection for auth, and basic
                      site security. The product cannot work without these.
                    </td>
                    <td className="p-3 align-top text-zinc-400">
                      Auth.js / NextAuth session cookies (e.g. session token)
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 text-zinc-200 font-medium align-top">Preferences</td>
                    <td className="p-3 align-top">
                      Remember choices such as cookie notice acknowledgment or UI preferences
                      stored locally in your browser.
                    </td>
                    <td className="p-3 align-top text-zinc-400">
                      localStorage keys (e.g. cookie consent)
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 text-zinc-200 font-medium align-top">Analytics</td>
                    <td className="p-3 align-top">
                      Help us understand aggregate traffic and page performance. We use Vercel
                      Analytics, which is designed to be privacy-oriented and does not sell ads
                      against your profile.
                    </td>
                    <td className="p-3 align-top text-zinc-400">Vercel Analytics</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3">
              We do <strong className="text-zinc-200">not</strong> use third-party advertising
              cookies or social media tracking pixels to build marketing profiles for sale.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">3. Legal basis &amp; consent</h2>
            <p>
              Essential cookies are necessary for the service and do not require consent under
              typical ePrivacy rules. Analytics cookies / scripts are used to improve the product.
              Where required, we show a cookie notice so you can acknowledge our use of analytics.
              You can also control cookies through your browser settings (blocking essential
              cookies may prevent login).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">4. How long they last</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong className="text-zinc-200">Session cookies</strong> — expire when you close
                the browser or when the session ends.
              </li>
              <li>
                <strong className="text-zinc-200">Persistent cookies / tokens</strong> — may last up
                to the session max age (currently about 30 days for auth), or until you sign out /
                clear site data.
              </li>
              <li>
                <strong className="text-zinc-200">Consent preference</strong> — stored in
                localStorage until you clear it.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">5. Managing cookies</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Sign out to end your auth session</li>
              <li>Clear site data / cookies in your browser settings</li>
              <li>
                Use browser controls to block third-party or all cookies (may break login)
              </li>
              <li>
                Contact{" "}
                <a href="mailto:privacy@trustticker.com" className="text-emerald-400 hover:underline">
                  privacy@trustticker.com
                </a>{" "}
                with privacy questions
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">6. Changes</h2>
            <p>
              We may update this Cookie Policy when our practices change. The date at the top will
              be revised when we do.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">7. Related policies</h2>
            <p className="flex flex-wrap gap-4">
              <Link href="/legal/privacy" className="text-emerald-400 hover:underline">
                Privacy Policy
              </Link>
              <Link href="/legal/terms" className="text-emerald-400 hover:underline">
                Terms of Service
              </Link>
              <Link href="/legal/disclaimer" className="text-emerald-400 hover:underline">
                Disclaimer
              </Link>
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
