export { SQUAWK_ENGINE_VERSION } from "./version.ts";
export * from "./types.ts";
export {
  scrubForSpeech,
  assertNoSecretsInScript,
  rejectRawArticleFields,
} from "./privacy.ts";
export {
  pronounceSymbol,
  applyPronunciationDictionary,
  getPronunciationDictionary,
} from "./pronunciation.ts";
export { buildSquawkScript } from "./script.ts";
export {
  computeSquawkPriority,
  meetsMinPriority,
  shouldInterrupt,
} from "./priority.ts";
export { isInQuietHours, etMinutesSinceMidnight } from "./quiet-hours.ts";
export { decideDedupe, dedupeKey } from "./dedupe.ts";
export {
  createEmptyQueue,
  enqueueSquawk,
  completeCurrent,
  clearQueue,
} from "./queue.ts";
export {
  normalizeSquawkSettings,
  loadSquawkSettings,
  saveSquawkSettings,
  SQUAWK_SETTINGS_KEY,
} from "./settings.ts";
export { catalystToUtterance } from "./from-catalyst.ts";
export {
  buildMonitorSquawkScript,
  type MonitorSquawkScriptInput,
} from "./monitor-script.ts";
export {
  MONITOR_SQUAWK_EVENT_TYPES,
  isHighValueMonitorSquawkType,
  monitorEventPriority,
  tapeItemToMonitorSquawkInput,
  attentionLeaderToMonitorSquawkInput,
  monitorEventToUtterance,
  type MonitorSquawkEventInput,
  type MonitorSquawkEventType,
} from "./from-monitor.ts";
export {
  detectSpeechSynthesis,
  detectNotificationActions,
} from "./browser-support.ts";
export {
  showFocusCatalystNotification,
  ensureNotificationPermission,
} from "./notifications.ts";