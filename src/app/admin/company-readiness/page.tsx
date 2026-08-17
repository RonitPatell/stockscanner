import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/api-guard";
import { AdminCompanyReadinessClient } from "./AdminCompanyReadinessClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Company data readiness — TrustTicker Admin",
  robots: { index: false, follow: false },
};

export default async function AdminCompanyReadinessPage() {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-[#090807] text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-[#090807]/90 backdrop-blur px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500">Admin</div>
          <h1 className="text-lg font-semibold">Company data readiness</h1>
        </div>
        <div className="flex gap-3 text-sm">
          <Link href="/admin/funnel" className="text-zinc-400 hover:text-zinc-200">
            Funnel
          </Link>
          <Link href="/admin/ingest" className="text-zinc-400 hover:text-zinc-200">
            Ingest
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <p className="text-sm text-zinc-400 mb-6">
          Diagnose why Research Financials or Capital can be empty for a ticker.
          Retry enqueues the same hydration job used by cron.
        </p>
        <AdminCompanyReadinessClient />
      </main>
    </div>
  );
}
