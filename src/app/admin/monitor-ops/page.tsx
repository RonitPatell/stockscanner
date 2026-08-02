import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/api-guard";
import { AdminMonitorOpsClient } from "./AdminMonitorOpsClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Monitor Operations — TrustTicker",
  robots: { index: false, follow: false },
};

export default async function AdminMonitorOpsPage() {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-xl font-semibold tracking-tight">
              Monitor Operations
            </h1>
            <p className="max-w-2xl text-sm text-zinc-400">
              Live delivery health, momentum/data quality, calibration, and
              confirmed control-plane actions. Provider secrets are never shown.
              Reprocess creates derived sessions only — history is not rewritten.
            </p>
          </div>
          <nav className="flex flex-wrap gap-3 text-xs text-zinc-400">
            <Link href="/admin/monitor-snapshot" className="hover:text-zinc-200">
              Snapshot freshness
            </Link>
            <Link href="/admin/monitor-calibration" className="hover:text-zinc-200">
              Calibration
            </Link>
            <Link href="/admin/reliability" className="hover:text-zinc-200">
              Reliability
            </Link>
            <Link href="/admin/latency" className="hover:text-zinc-200">
              Latency
            </Link>
            <Link href="/admin/ingest" className="hover:text-zinc-200">
              Ingest
            </Link>
          </nav>
        </div>
        <AdminMonitorOpsClient />
      </div>
    </main>
  );
}
