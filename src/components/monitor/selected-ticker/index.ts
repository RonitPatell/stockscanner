/**
 * Public barrel. Node unit tests should import `.ts` modules directly —
 * do not pull SelectedTickerPanel.tsx through a test entry (strip-types).
 */
export { SelectedTickerPanel } from "./SelectedTickerPanel.tsx";
export {
  buildSelectedTicker,
  stickSelectedTicker,
  type SelectedTickerSeed,
} from "./build-selected-ticker.ts";
export {
  MONITOR_SYMBOL_PARAM,
  symbolFromSearchParams,
  writeMonitorSymbolDeepLink,
  clearMonitorSymbolDeepLink,
} from "./deep-link.ts";
export {
  formatMonitorNumber,
  formatMonitorText,
  availNum,
  availText,
  unavailableNum,
  unavailableText,
  stickMonitorNumber,
} from "./selected-ticker-format.ts";
export type {
  MonitorSelectedTicker,
  MonitorPrimaryRisk,
  MonitorRiskKind,
  MonitorIntelSectionId,
} from "./selected-ticker-types.ts";
export {
  MONITOR_INTEL_SECTIONS,
  MONITOR_PRIMARY_RISK_KINDS,
  MONITOR_SELECTED_TICKER_DISCLAIMER,
} from "./selected-ticker-types.ts";
