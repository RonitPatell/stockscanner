import { notFound } from "next/navigation";
import { ThesisPanel } from "@/components/ticker/thesis/ThesisPanel";
import { isE2eWorkflowHarnessAllowed } from "@/lib/e2e-harness";

export const dynamic = "force-dynamic";

/**
 * Seeded Thesis UI harness for Playwright.
 * Gated by ALLOW_E2E_HARNESS / local development — not available in production.
 * Tests mock /api/thesis* routes for persistence without a live session.
 */
export default function ThesisHarnessPage() {
  if (!isE2eWorkflowHarnessAllowed()) notFound();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <main className="max-w-3xl mx-auto px-4 py-10">
        <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500 mb-2">
          E2E thesis harness
        </p>
        <h1 className="text-2xl font-bold mb-6 font-mono text-emerald-400">
          DEMO
        </h1>
        <ThesisPanel symbol="DEMO" />
      </main>
    </div>
  );
}
