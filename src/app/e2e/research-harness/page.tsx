import { notFound } from "next/navigation";
import { ResearchDesk } from "@/components/dashboard-shell/ResearchDesk";
import { isE2eWorkflowHarnessAllowed } from "@/lib/e2e-harness";

export const dynamic = "force-dynamic";

/**
 * Research desk harness for Playwright navigation + permission UI.
 * Gated by ALLOW_E2E_HARNESS / local development.
 */
export default async function ResearchHarnessPage({
  searchParams,
}: {
  searchParams: Promise<{ entitled?: string; symbol?: string }>;
}) {
  if (!isE2eWorkflowHarnessAllowed()) notFound();
  const sp = await searchParams;
  const entitled = sp.entitled !== "0";
  const seed = ["AAPL", "MSFT", "NVDA"];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <main className="max-w-[1680px] mx-auto px-3 sm:px-4 py-6">
        <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500 mb-4">
          E2E research harness
        </p>
        <ResearchDesk seedSymbols={seed} entitled={entitled} />
      </main>
    </div>
  );
}
