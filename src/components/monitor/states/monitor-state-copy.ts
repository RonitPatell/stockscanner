/**
 * TrustTicker Monitor — non-ideal state copy & helpers.
 * User-facing only: no hostnames, credentials, or stack traces.
 */

/** User-facing outage categories (never internal service names). */
export const MONITOR_OUTAGE_CATEGORIES = [
  { id: "quotes", label: "Market quotes" },
  { id: "news", label: "News and catalysts" },
  { id: "filings", label: "Filings and evidence" },
  { id: "stream", label: "Live stream" },
] as const;

export type MonitorOutageCategoryId =
  (typeof MONITOR_OUTAGE_CATEGORIES)[number]["id"];

export const MONITOR_PUBLIC_STATUS_HREF = "/status";

export const MONITOR_QUIET_TITLE = "Quiet market";
export const MONITOR_QUIET_BODY =
  "No priority tickers right now. TrustTicker does not invent or promote artificial candidates merely to fill the screen.";

export const MONITOR_NO_MATCH_TITLE =
  "No priority tickers match this preset right now.";
export const MONITOR_NO_MATCH_BODY =
  "Widen the inspection set, switch preset, or open your Watchlist.";

export const MONITOR_LOADING_TITLE = "Connecting Monitor";
export const MONITOR_LOADING_SYSTEMS = [
  "Priority ladder",
  "Momentum field",
  "Market stream",
  "Event tape",
] as const;

export const MONITOR_DISCONNECT_TITLE = "Disconnected";
export const MONITOR_DISCONNECT_BODY =
  "Live stream is offline. Values below are last known — not live.";

export const MONITOR_ERROR_TITLE = "Monitor could not load";
export const MONITOR_ERROR_BODY =
  "Something went wrong while loading the desk. Retry, or share the diagnostic reference with support.";

const HOST_LEAK =
  /\b(?:localhost|127\.0\.0\.1|[\w-]+\.(?:internal|local|svc|amazonaws\.com|railway\.app))\b/i;
const SECRET_LEAK =
  /\b(?:password|secret|token|api[_-]?key|bearer|authorization)\b/i;

/** Strip notes that could leak infra or secrets. */
export function sanitizeProviderNotes(notes: string[]): string[] {
  return notes
    .map((n) => n.trim())
    .filter((n) => n.length > 0)
    .filter((n) => !HOST_LEAK.test(n) && !SECRET_LEAK.test(n))
    .slice(0, 6);
}

/** Map free-text notes → user-facing outage categories (deduped). */
export function outageCategoriesFromNotes(
  notes: string[]
): MonitorOutageCategoryId[] {
  const ids = new Set<MonitorOutageCategoryId>();
  const blob = notes.join(" ").toLowerCase();
  if (/quote|price|market data|spread|volume/.test(blob)) ids.add("quotes");
  if (/news|catalyst|wire|headline/.test(blob)) ids.add("news");
  if (/filing|sec|evidence|dilution/.test(blob)) ids.add("filings");
  if (/stream|provider|outage|disconnect|degraded|stale/.test(blob)) {
    ids.add("stream");
  }
  if (ids.size === 0) ids.add("stream");
  return [...ids];
}

/** Support-safe diagnostic id — no PII, no secrets, no stack. */
export function createMonitorDiagnosticId(nowMs: number = Date.now()): string {
  const t = nowMs.toString(36);
  const r = Math.floor(Math.random() * 1e9)
    .toString(36)
    .padStart(6, "0")
    .slice(0, 6);
  return `mon_${t}_${r}`;
}

export function isStaleFreshnessMs(ms: number | null | undefined): boolean {
  return ms != null && ms > 15_000;
}

export type PartialDataExample = {
  available: string;
  unavailable: string;
};

export const PARTIAL_DATA_EXAMPLES: PartialDataExample[] = [
  {
    available: "Catalyst",
    unavailable: "Quote unavailable",
  },
  {
    available: "Momentum",
    unavailable: "Float unavailable",
  },
  {
    available: "Market data live",
    unavailable: "News provider degraded",
  },
  {
    available: "Analogues",
    unavailable: "Historical sample too small",
  },
];
