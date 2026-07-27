import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/api-guard";
import { AdminJudgmentClient } from "./AdminJudgmentClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Judgment Review — TrustTicker",
  robots: { index: false, follow: false },
};

export default async function AdminJudgmentPage() {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-[#090807] text-zinc-100">
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-[#090807]/90 backdrop-blur px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500">Admin</div>
          <h1 className="text-lg font-semibold">Judgment review queue</h1>
        </div>
        <div className="flex gap-3 text-sm">
          <Link href="/admin/funnel" className="text-zinc-400 hover:text-zinc-200">
            Funnel
          </Link>
          <Link href="/admin/demo" className="text-zinc-400 hover:text-zinc-200">
            Demo
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">
        <AdminJudgmentClient />
      </main>
    </div>
  );
}
