import { isMonitorV1Enabled } from "../monitor/flags.ts";

export type DashboardDestination =
  | "monitor"
  | "feed"
  | "watchlist"
  | "plan"
  | "risk"
  | "review";

export const DASHBOARD_DESTINATIONS: Array<{
  id: DashboardDestination;
  label: string;
  href: string;
  description: string;
}> = [
  {
    id: "monitor",
    label: "Monitor",
    href: "/dashboard?view=monitor",
    description: "TrustTicker Monitor — priority ladder and momentum field",
  },
  {
    id: "feed",
    label: "Feed",
    href: "/dashboard?view=feed",
    description: "Live catalyst feed and Focus Mode",
  },
  {
    id: "watchlist",
    label: "Watchlist",
    href: "/dashboard?view=watchlist",
    description: "Watchlist filter and briefs",
  },
  {
    id: "plan",
    label: "Plan",
    href: "/dashboard?view=plan",
    description: "Session Plan and Daily Plan",
  },
  {
    id: "risk",
    label: "Capital Risk",
    href: "/dashboard?view=capital-risk",
    description: "Financing exposure and dilution capacity (deep link)",
  },
  {
    id: "review",
    label: "Review",
    href: "/dashboard?view=review",
    description: "Green Ledger, feedback, autopsies, paper decisions",
  },
];

const VALID = new Set<DashboardDestination>(
  DASHBOARD_DESTINATIONS.map((d) => d.id)
);

/** Destinations visible in nav (Monitor gated by monitorV1). */
export function visibleDestinations(): typeof DASHBOARD_DESTINATIONS {
  if (isMonitorV1Enabled()) return DASHBOARD_DESTINATIONS;
  return DASHBOARD_DESTINATIONS.filter((d) => d.id !== "monitor");
}

/** Map legacy panel deep-links to V3 destinations. */
export function destinationFromSearchParams(
  params: URLSearchParams
): DashboardDestination {
  const monitorOn = isMonitorV1Enabled();
  const view = params.get("view")?.toLowerCase();
  if (view === "monitor") {
    return monitorOn ? "monitor" : "feed";
  }
  if (view === "portfolio" || view === "watchlist") return "watchlist";
  if (view === "research") return "watchlist"; // Research is desk-mode; deep-link seeds Portfolio then client opens Research via modeFromLegacyView
  if (view === "markets" || view === "floor" || view === "news" || view === "feed")
    return "feed";
  if (view === "structure" || view === "risk" || view === "dilution" || view === "capital" || view === "capital-risk") {
    return "risk";
  }
  if (view && VALID.has(view as DashboardDestination) && view !== "monitor") {
    return view as DashboardDestination;
  }

  const panel = (params.get("panel") ?? "").toLowerCase();
  if (
    panel === "session-plan" ||
    panel === "plan" ||
    panel === "daily-plan" ||
    panel === "today"
  ) {
    return "plan";
  }
  if (
    panel === "dilution" ||
    panel === "dilution-radar" ||
    panel === "halts" ||
    panel === "risk" ||
    panel === "offerings"
  ) {
    return "risk";
  }
  if (
    panel === "ledger" ||
    panel === "skip-ledger" ||
    panel === "green-ledger" ||
    panel === "feedback" ||
    panel === "trader-feedback" ||
    panel === "review" ||
    panel === "paper"
  ) {
    return "review";
  }
  if (panel === "watchlist" || panel === "brief") return "watchlist";
  if (panel === "feed" || panel === "news" || panel === "scanner") return "feed";
  if (panel === "monitor" || panel === "tt-monitor") {
    return monitorOn ? "monitor" : "feed";
  }

  if (params.get("tab") === "watchlist") return "watchlist";

  // Default landing: Monitor when flag on, else Feed.
  return monitorOn ? "monitor" : "feed";
}

export function destinationDeepLink(
  id: DashboardDestination,
  extra?: Record<string, string>
): string {
  const q = new URLSearchParams({ view: id, ...extra });
  return `/dashboard?${q.toString()}`;
}
