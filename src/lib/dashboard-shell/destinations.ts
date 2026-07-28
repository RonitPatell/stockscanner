export type DashboardDestination =
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
    label: "Risk",
    href: "/dashboard?view=risk",
    description: "Dilution, offerings, halts, structural risk",
  },
  {
    id: "review",
    label: "Review",
    href: "/dashboard?view=review",
    description: "Green Ledger, feedback, autopsies, paper decisions",
  },
];

const VALID = new Set<DashboardDestination>([
  "feed",
  "watchlist",
  "plan",
  "risk",
  "review",
]);

/** Map legacy panel deep-links to V3 destinations. */
export function destinationFromSearchParams(
  params: URLSearchParams
): DashboardDestination {
  const view = params.get("view")?.toLowerCase();
  if (view && VALID.has(view as DashboardDestination)) {
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

  // ?focus=1 stays on Feed with Focus Mode
  if (params.get("tab") === "watchlist") return "watchlist";

  return "feed";
}

export function destinationDeepLink(
  id: DashboardDestination,
  extra?: Record<string, string>
): string {
  const q = new URLSearchParams({ view: id, ...extra });
  return `/dashboard?${q.toString()}`;
}
