import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/api-guard";
import { AdminReliabilityClient } from "./AdminReliabilityClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Reliability Ops — TrustTicker",
  robots: { index: false, follow: false },
};

export default async function AdminReliabilityPage() {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-8">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold">Service reliability</h1>
          <div className="flex gap-3 text-xs text-zinc-400">
            <Link href="/admin/ingest">Ingest</Link>
            <Link href="/admin/latency">Latency</Link>
            <Link href="/admin/alert-backbone">Alerts</Link>
            <Link href="/admin/monitor-ops">Monitor ops</Link>
            <Link href="/admin/monitor-calibration">Monitor calibration</Link>
            <Link href="/status">Public status</Link>
          </div>
        </div>
        <p className="text-sm text-zinc-400">
          Configurable indicators, incident timeline, monthly report, and
          subscription credit preview/apply. Credits are never trading-loss
          reimbursement.
        </p>
        <AdminReliabilityClient />
      </div>
    </div>
  );
}
