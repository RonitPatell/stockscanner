import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 px-4 sm:px-6 h-14 flex items-center">
        <Link href="/" className="text-emerald-400 hover:underline text-sm">← Back to TrustTicker</Link>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-8">Privacy Policy</h1>
        <div className="space-y-4 text-sm text-zinc-300 leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">Information We Collect</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Account information: email, name, password (hashed)</li>
              <li>Payment information: processed by Stripe (we do not store card numbers)</li>
              <li>Alert preferences: Discord webhook URLs, phone numbers</li>
              <li>Usage data: pages visited, features used, device information</li>
            </ul>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">How We Use Your Information</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Provide and improve the TrustTicker service</li>
              <li>Process subscription payments</li>
              <li>Send catalyst alerts via your configured channels</li>
              <li>Communicate service updates and support</li>
            </ul>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">Data Sharing</h2>
            <p>
              We do not sell your personal data. We share data only with service providers
              necessary to operate the platform (Stripe for payments, hosting providers).
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">Data Security</h2>
            <p>
              Passwords are hashed with bcrypt. All connections use HTTPS. We follow industry
              best practices but cannot guarantee absolute security.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">Your Rights</h2>
            <p>
              You may request access to, correction of, or deletion of your personal data by
              contacting us. You may cancel your subscription and delete your account at any time.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">Cookies</h2>
            <p>We use essential cookies for authentication and session management.</p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">Contact</h2>
            <p>For privacy inquiries, contact: privacy@trustticker.com</p>
          </section>
        </div>
        <p className="text-xs text-zinc-600 mt-12">Last updated: {new Date().toLocaleDateString()}</p>
      </main>
    </div>
  );
}
