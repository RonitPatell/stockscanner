"use client";

import { useRouter } from "next/navigation";
import {
  visibleDestinations,
  type DashboardDestination,
} from "@/lib/dashboard-shell";
import { cn } from "@/lib/utils";
import {
  prefetchMonitorOnIntent,
  type MonitorPrefetchAccess,
} from "@/lib/monitor/prefetch";

export function DashboardSecondaryNav({
  active,
  onChange,
  className,
  hiddenIds,
  prefetchAccess,
}: {
  active: DashboardDestination;
  onChange: (id: DashboardDestination) => void;
  className?: string;
  /** Hide Plan / Risk / Review while Focus Mode V2 is active */
  hiddenIds?: DashboardDestination[];
  /** When set, hover/focus on Monitor warms the route (entitled users only). */
  prefetchAccess?: MonitorPrefetchAccess;
}) {
  const router = useRouter();
  const hidden = new Set(hiddenIds ?? []);
  const items = visibleDestinations().filter((d) => !hidden.has(d.id));

  const onMonitorIntent = () => {
    if (!prefetchAccess) return;
    prefetchMonitorOnIntent(router, prefetchAccess);
  };

  return (
    <nav
      data-guide="dashboard-secondary-nav"
      aria-label="Dashboard destinations"
      className={cn(
        "tt-desk-nav shrink-0 border-b border-[var(--border)] bg-[var(--background)] h-10 sm:h-11",
        className
      )}
    >
      <div className="max-w-[1680px] mx-auto px-2 sm:px-4 h-full flex items-stretch gap-0.5 overflow-x-auto">
        {items.map((d) => (
          <button
            key={d.id}
            type="button"
            data-destination={d.id}
            data-active={active === d.id}
            data-testid={`nav-${d.id}`}
            title={d.description}
            onClick={() => onChange(d.id)}
            onMouseEnter={d.id === "monitor" ? onMonitorIntent : undefined}
            onFocus={d.id === "monitor" ? onMonitorIntent : undefined}
            className={cn(
              "px-3 sm:px-4 text-[12px] sm:text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap",
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
