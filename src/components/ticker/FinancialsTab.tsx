import { QuarterlyDeltaTable } from "./QuarterlyDeltaTable";
import type { QuarterlyDeltaReport } from "@/lib/metrics/quarterly-delta";

export function FinancialsTab({
  report,
}: {
  report: QuarterlyDeltaReport;
}) {
  return (
    <section data-testid="ticker-financials" className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-zinc-200 mb-1">
          Quarterly Delta
        </h2>
        <p className="text-[12px] text-zinc-500 leading-relaxed max-w-prose">
          Compare core metrics across reporting periods without reading the full
          filing. Labels stay factual: higher, lower, unavailable.
        </p>
      </div>
      <QuarterlyDeltaTable report={report} />
    </section>
  );
}
