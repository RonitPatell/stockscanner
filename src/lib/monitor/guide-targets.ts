/**
 * data-guide targets for TrustTicker Monitor V1.
 * Each must appear exactly once when the Monitor destination is mounted.
 */
export const MONITOR_GUIDE_TARGETS = [
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
  // Present on live Shell V3 Monitor destination (not e2e harness):
  // "monitor-beta-chrome"
] as const;

export type MonitorGuideTarget = (typeof MONITOR_GUIDE_TARGETS)[number];
