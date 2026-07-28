"use client";

import {
  DASHBOARD_DESTINATIONS,
  type DashboardDestination,
} from "@/lib/dashboard-shell";
import { cn } from "@/lib/utils";

export function DashboardSecondaryNav({
  active,
  onChange,
  className,
  hiddenIds,
}: {
  active: DashboardDestination;
  onChange: (id: DashboardDestination) => void;
  className?: string;
  /** Hide Plan / Risk / Review while Focus Mode V2 is active */
  hiddenIds?: DashboardDestination[];
}) {
  const hidden = new Set(hiddenIds ?? []);
  const items = DASHBOARD_DESTINATIONS.filter((d) => !hidden.has(d.id));
  return (
    <nav
      data-guide="dashboard-secondary-nav"
      aria-label="Dashboard destinations"
      className={cn(
        "shrink-0 border-b border-[var(--border)] bg-[var(--background)]",
        className
      )}
    >
      <div className="max-w-[1680px] mx-auto px-2 sm:px-4 flex items-stretch gap-0.5 overflow-x-auto">
        {items.map((d) => (
          <button
            key={d.id}
            type="button"
            data-destination={d.id}
            data-active={active === d.id}
            data-testid={`nav-${d.id}`}
            title={d.description}
            onClick={() => onChange(d.id)}
            className={cn(
              "px-3 sm:px-4 py-2.5 text-[12px] sm:text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap",
              active === d.id
                ? "border-emerald-400 text-emerald-300"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            )}
          >
            {d.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
