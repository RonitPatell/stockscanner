import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/api-guard";
import { AdminFunnelClient } from "./AdminFunnelClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Funnel Admin — TrustTicker",
  robots: { index: false, follow: false },
};

export default async function AdminFunnelPage() {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-[#090807] text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-[#090807]/90 backdrop-blur px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500">Admin</div>
          <h1 className="text-lg font-semibold">Signup funnel</h1>
        </div>
        <div className="flex gap-3 text-sm">
          <Link href="/admin/ingest" className="text-zinc-400 hover:text-zinc-200">
            Ingest
          </Link>
          <Link href="/admin/company-readiness" className="text-zinc-400 hover:text-zinc-200">
            Data readiness
          </Link>
          <Link href="/admin/latency" className="text-zinc-400 hover:text-zinc-200">
            Latency
          </Link>
          <Link href="/admin/demo" className="text-zinc-400 hover:text-zinc-200">
            Demo
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <p className="text-sm text-zinc-400 mb-6">
          Vendor-neutral counters — no emails, phones, webhooks, or raw watchlists.
          Day filter uses UTC cohort buckets when Redis is configured.
        </p>
        <AdminFunnelClient />
      </main>
    </div>
  );
}
