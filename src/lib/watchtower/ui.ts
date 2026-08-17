/**
 * Pure helpers for Watchtower UI — filter chips, labels, visit tracking.
 * Review priority only; never buy/sell language.
 */

import type { SignificanceLevel } from "../company-events/significance.ts";
import type { WatchtowerEventDto } from "../watchtower/types.ts";

export const WATCHTOWER_LAST_VISIT_KEY = "tt-watchtower-last-visit";

export type WatchtowerFeedFilterId =
  | "all"
  | "high"
  | "capital"
  | "financial"
  | "insider"
  | "ownership"
  | "management"
  | "filings";

export type WatchtowerFeedFilter = {
  id: WatchtowerFeedFilterId;
  label: string;
  /** Query params appended to GET /api/watchtower */
  params: Record<string, string>;
};

export const WATCHTOWER_FEED_FILTERS: WatchtowerFeedFilter[] = [
  { id: "all", label: "All", params: {} },
  { id: "high", label: "High significance", params: { significance: "HIGH" } },
  { id: "capital", label: "Capital", params: { category: "capital" } },
  { id: "financial", label: "Financial", params: { category: "financial" } },
  { id: "insider", label: "Insider", params: { category: "insider" } },
  { id: "ownership", label: "Ownership", params: { category: "ownership" } },
  { id: "management", label: "Management", params: { category: "management" } },
  { id: "filings", label: "Filings", params: { category: "filing" } },
];

const REASON_LABELS: Record<string, string> = {
  GOING_CONCERN: "Going-concern language",
  BANKRUPTCY_RECEIVERSHIP: "Bankruptcy / receivership",
  AUDITOR_RESIGNATION_OR_DISMISSAL: "Auditor change",
  RESTATEMENT_OR_NON_RELIANCE: "Restatement / non-reliance",
  MAJOR_CAPITAL_RAISE: "Major capital raise",
  MAJOR_MANAGEMENT_DEPARTURE: "Management departure",
  LATE_PERIODIC_REPORT: "Late periodic report",
  SUBSTANTIAL_SHARE_COUNT_INCREASE: "Substantial share-count increase",
  IMPAIRMENT_DISCLOSURE: "Impairment disclosure",
  NEW_SHELF_REGISTRATION: "New shelf registration",
  OWNERSHIP_THRESHOLD_CHANGE: "Ownership threshold change",
  NEW_DEBT_OR_MATERIAL_AGREEMENT: "Material agreement / debt",
  MATERIAL_MARGIN_OR_RESULTS: "Results / margin disclosure",
  INSIDER_OPEN_MARKET_SALE: "Insider open-market sale",
  ATM_PROGRAM_DETECTED: "ATM program",
  CONVERTIBLE_OR_WARRANT_CAPITAL: "Convertible / warrant capital",
  DIRECTOR_OR_BOARD_CHANGE: "Director / board change",
  ROUTINE_PERIODIC_FILING: "Routine periodic filing",
  ROUTINE_OWNERSHIP_AMENDMENT: "Ownership amendment",
  ROUTINE_INSIDER_FORM: "Insider form",
  EFFECTIVE_REGISTRATION_NOTICE: "Effective registration",
  PROXY_OR_ADMINISTRATIVE: "Proxy / administrative",
  ROUTINE_COMPENSATION_GRANT: "Compensation grant",
  ADMINISTRATIVE_FILING: "Administrative filing",
  NO_MATERIAL_IMPACT_EVIDENCE: "No material-impact evidence",
  UNKNOWN_OR_INSUFFICIENT_EVIDENCE: "Insufficient evidence",
  LOW_CLASSIFIER_CONFIDENCE: "Lower classifier confidence",
};

export function reasonCodeLabel(code: string): string {
  return REASON_LABELS[code] ?? code.replace(/_/g, " ").toLowerCase();
}

export function significanceDisplay(
  level: SignificanceLevel | string | null | undefined
): string {
  if (!level) return "Unscored";
  switch (level) {
    case "HIGH":
      return "High";
    case "MEDIUM":
      return "Medium";
    case "LOW":
      return "Low";
    case "INFORMATIONAL":
      return "Informational";
    default:
      return String(level);
  }
}

/** Calm badge classes — review priority, not alarm styling. */
export function significanceBadgeClass(
  level: SignificanceLevel | string | null | undefined
): string {
  switch (level) {
    case "HIGH":
      return "border-amber-500/40 bg-amber-500/10 text-amber-200";
    case "MEDIUM":
      return "border-sky-500/35 bg-sky-500/10 text-sky-200";
    case "LOW":
      return "border-zinc-600 bg-zinc-800/60 text-zinc-300";
    case "INFORMATIONAL":
      return "border-zinc-700 bg-transparent text-zinc-500";
    default:
      return "border-zinc-700 text-zinc-500";
  }
}

export function formatEventWhen(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = Math.max(0, now - t);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function buildWatchtowerQuery(
  filter: WatchtowerFeedFilterId,
  extras?: { cursor?: string | null; limit?: number; unreadOnly?: boolean }
): string {
  const def =
    WATCHTOWER_FEED_FILTERS.find((f) => f.id === filter) ??
    WATCHTOWER_FEED_FILTERS[0]!;
  const sp = new URLSearchParams();
  sp.set("limit", String(extras?.limit ?? 40));
  for (const [k, v] of Object.entries(def.params)) sp.set(k, v);
  if (extras?.cursor) sp.set("cursor", extras.cursor);
  if (extras?.unreadOnly) sp.set("unreadOnly", "true");
  return sp.toString();
}

export function countRequiringReview(items: WatchtowerEventDto[]): number {
  return items.filter(
    (i) =>
      i.significance.level === "HIGH" &&
      !i.readState.isRead &&
      !i.readState.isDismissed
  ).length;
}

export function countNewSince(
  items: WatchtowerEventDto[],
  sinceIso: string | null
): number {
  if (!sinceIso) return items.filter((i) => !i.readState.isRead).length;
  const since = new Date(sinceIso).getTime();
  if (Number.isNaN(since)) return 0;
  return items.filter((i) => {
    const detected = new Date(i.detectedAt).getTime();
    return !Number.isNaN(detected) && detected > since;
  }).length;
}

export function loadWatchtowerLastVisit(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(WATCHTOWER_LAST_VISIT_KEY);
  } catch {
    return null;
  }
}

export function saveWatchtowerLastVisit(iso = new Date().toISOString()): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WATCHTOWER_LAST_VISIT_KEY, iso);
  } catch {
    /* ignore */
  }
}

export function eventIdFromSearchParams(
  params: URLSearchParams
): string | null {
  const id =
    params.get("eventId") ?? params.get("weid") ?? params.get("companyEventId");
  if (!id || id.length > 64) return null;
  return id;
}

export function writeWatchtowerDeepLink(eventId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("view", "watchtower");
    if (eventId) url.searchParams.set("eventId", eventId);
    else url.searchParams.delete("eventId");
    url.searchParams.delete("weid");
    url.searchParams.delete("companyEventId");
    window.history.replaceState({}, "", url.toString());
  } catch {
    /* ignore */
  }
}
