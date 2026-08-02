import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/api-guard";
import { AdminMonitorCalibrationClient } from "./AdminMonitorCalibrationClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Monitor Calibration — TrustTicker",
  robots: { index: false, follow: false },
};

export default async function AdminMonitorCalibrationPage() {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    redirect("/login");
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 text-zinc-100">
      <header className="mb-6 space-y-2">
        <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
          <Link href="/admin/monitor-ops" className="hover:text-zinc-200">
            Monitor ops
          </Link>
          <Link href="/admin/latency" className="hover:text-zinc-200">
            Latency
          </Link>
          <Link href="/admin/reliability" className="hover:text-zinc-200">
            Reliability
          </Link>
          <Link href="/admin/alert-backbone" className="hover:text-zinc-200">
            Alerts
          </Link>
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Monitor Replay & Calibration</h1>
        <p className="max-w-2xl text-sm text-zinc-400">
          Compact, versioned as-of snapshots for deterministic replay and descriptive calibration.
          Candidate engines are compared in shadow only — user-facing Monitor output is unchanged.
        </p>
      </header>
      <AdminMonitorCalibrationClient />
    </main>
  );
}
