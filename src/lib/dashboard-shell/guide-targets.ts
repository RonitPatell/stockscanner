/**
 * Expected data-guide targets for Dashboard Shell V3.
 * Each must appear when the matching mode (or shell chrome) is visible.
 */
export const DASHBOARD_SHELL_V3_GUIDE_TARGETS = [
  "dashboard-top-bar",
  "dashboard-secondary-nav",
  "connection-status",
  "trading-floor",
  "floor-movers",
  "floor-wire",
  "floor-gappers",
  "live-tape-chart",
  "news-feed",
  "focus-mode-rail",
  "focus-row-guide",
  "exit-focus-guide",
  "catalyst-context-drawer",
  "watchlist-destination",
  // TrustTicker Scanner (visible when monitorV1 flag on + Scanner mode)
  "monitor-beta-chrome",
  "monitor-status-bar",
  "monitor-priority-ladder",
  "monitor-momentum-field",
  "monitor-intelligence",
  "monitor-event-tape",
  "monitor-squawk",
  "monitor-search",
  "monitor-filter-preset",
  "monitor-preset",
  "monitor-connection",
  "monitor-session",
  "monitor-profile",
] as const;

export type DashboardShellGuideTarget =
  (typeof DASHBOARD_SHELL_V3_GUIDE_TARGETS)[number];
