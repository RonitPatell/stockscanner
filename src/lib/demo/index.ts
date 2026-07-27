export type {
  DemoMode,
  PublicDemoRecord,
  PublicDemoPayload,
  DemoAnalyticsEvent,
} from "./types.ts";
export { DEMO_MODES, DEMO_ANALYTICS_EVENTS } from "./types.ts";
export {
  getConfiguredDemoMode,
  getDemoDelayMinutes,
  demoModeLabel,
  isRedistributionPermitted,
  mustRedactLicensedText,
  REDISTRIBUTION_PERMITTED_SOURCES,
  LICENSED_OR_EDITORIAL_SOURCES,
} from "./licensing.ts";
export {
  toPublicDemoRecord,
  redactCuratedIfNeeded,
  assertNoPrivateFields,
} from "./sanitize.ts";
export { getPublicDemoPayload } from "./service.ts";
export {
  trackDemoEvent,
  getDemoEventCounts,
  isDemoAnalyticsEvent,
} from "./analytics.ts";
