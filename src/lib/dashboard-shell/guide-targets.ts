/**
 * Expected data-guide targets for Dashboard Shell V3.
 * Each must appear exactly once when the matching destination (or shell chrome) is visible.
 */
export const DASHBOARD_SHELL_V3_GUIDE_TARGETS = [
  "dashboard-top-bar",
  "dashboard-secondary-nav",
  "connection-status",
  "news-feed",
  "focus-mode-rail",
  "focus-row-guide",
  "exit-focus-guide",
  "catalyst-context-drawer",
  "watchlist-destination",
  "session-plan",
  "dilution-radar",
  "skip-ledger",
  "trader-feedback-panel",
  "review-destination",
  "risk-destination",
  "plan-destination",
] as const;

export type DashboardShellGuideTarget =
  (typeof DASHBOARD_SHELL_V3_GUIDE_TARGETS)[number];
