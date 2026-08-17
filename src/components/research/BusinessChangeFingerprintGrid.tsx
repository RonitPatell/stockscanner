"use client";

import type { BusinessChangeFingerprint } from "@/lib/company-state/fingerprint";

export function BusinessChangeFingerprintGrid({
  fingerprint,
  emptyMessage,
}: {
  fingerprint: BusinessChangeFingerprint | null;
  emptyMessage?: string | null;
}) {
  if (!fingerprint || fingerprint.rows.length === 0) {
    return (
      <p className="text-sm text-zinc-500" data-testid="business-fingerprint-empty">
        {emptyMessage ||
          "Not enough stored financial history yet to show trend arrows for this company."}
      </p>
    );
  }

  return (
    <div data-testid="business-change-fingerprint" className="overflow-x-auto">
      <table className="w-full text-left text-sm border-collapse">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-zinc-500">
            <th className="py-2 pr-3 font-medium">Metric</th>
            <th className="py-2 px-2 font-medium text-center">3Y</th>
            <th className="py-2 px-2 font-medium text-center">1Y</th>
            <th className="py-2 px-2 font-medium text-center">Latest</th>
          </tr>
        </thead>
        <tbody>
          {fingerprint.rows.map((row) => (
            <tr
              key={row.key}
              className="border-t border-zinc-800"
              data-testid={`fingerprint-row-${row.key}`}
            >
              <td className="py-2 pr-3 text-zinc-300">{row.label}</td>
              {row.cells.map((cell) => (
                <td
                  key={`${row.key}-${cell.window}`}
                  className="py-2 px-2 text-center font-mono text-zinc-100"
                  title={
                    cell.comparable && cell.percentChange != null
                      ? `${cell.percentChange.toFixed(1)}% (${cell.periodLabel ?? "—"})`
                      : cell.bpsChange != null
                        ? `${Math.round(cell.bpsChange)} bps`
                        : "Not comparable"
                  }
                >
                  {cell.arrow || "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-zinc-600 mt-2">
        Arrows follow simple rules on stored SEC metrics. Not investment advice.
      </p>
    </div>
  );
}
