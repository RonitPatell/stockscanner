export {
  isDashboardShellV3Enabled,
  DASHBOARD_SHELL_V3_FLAG,
} from "./flags.ts";
export {
  DASHBOARD_DESTINATIONS,
  visibleDestinations,
  destinationFromSearchParams,
  destinationDeepLink,
  type DashboardDestination,
} from "./destinations.ts";
export {
  DASHBOARD_SHELL_V3_GUIDE_TARGETS,
  type DashboardShellGuideTarget,
} from "./guide-targets.ts";
export {
  DESK_MODE_IDS,
  DESK_PRIMARY_MODE_IDS,
  DESK_MODE_META,
  DEFAULT_DESK_MODE,
  loadDeskMode,
  saveDeskMode,
  modeFromLegacyView,
  modeToPanelPrefs,
  toPrimaryDeskMode,
  DESK_PANEL_IDS,
  DESK_PANEL_META,
  DEFAULT_DESK_PANELS,
  loadDeskPanels,
  saveDeskPanels,
  sanitizeDeskPanels,
  panelsFromLegacyView,
  type DeskModeId,
  type DeskPrimaryModeId,
  type DeskPanelId,
  type DeskPanelPrefs,
} from "./panel-prefs.ts";
