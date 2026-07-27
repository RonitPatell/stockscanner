import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/api-guard";
import { AdminDemoClient } from "./AdminDemoClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Demo Admin — TrustTicker",
  robots: { index: false, follow: false },
};

export default async function AdminDemoPage() {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-[#090807] text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-[#090807]/90 backdrop-blur px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500">Admin</div>
          <h1 className="text-lg font-semibold">Public evidence demo</h1>
        </div>
        <div className="flex gap-3 text-sm">
          <Link href="/admin/ingest" className="text-zinc-400 hover:text-zinc-200">
            Ingest
          </Link>
          <Link href="/admin/latency" className="text-zinc-400 hover:text-zinc-200">
            Latency
          </Link>
          <Link href="/demo" className="text-zinc-400 hover:text-zinc-200">
            View demo
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">
        <p className="text-sm text-zinc-400 mb-6">
          Approve only redistribution-permitted wires/SEC. Never invent prices,
          traders, or headlines. Licensed editorial text stays redacted on the
          public demo.
        </p>
        <AdminDemoClient />
      </main>
    </div>
  );
}
