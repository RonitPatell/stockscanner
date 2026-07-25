/**
 * Platform Guide — single source of truth for the in-app tour.
 *
 * VERSION: bump PLATFORM_GUIDE_VERSION whenever steps change so returning
 * traders get prompted that the tour was updated.
 *
 * When you add/remove/rename major dashboard panels, update DASHBOARD_GUIDE_STEPS
 * (and DESK_GUIDE_STEPS if Prop Desk changed). Keep copy trader-plain.
 */

export const PLATFORM_GUIDE_VERSION = 12;

export type GuideSurface = "dashboard" | "desk";

export interface GuideStep {
  id: string;
  /** Matches data-guide="..." on the DOM target */
  target?: string;
  title: string;
  body: string;
  /** Expand the "judgment tools" section before highlighting */
  requiresExtras?: boolean;
  tip?: string;
}

export const DASHBOARD_GUIDE_STEPS: GuideStep[] = [
  {
    id: "welcome",
    title: "Welcome to your desk",
    body: "Focus mode is the default on purpose: news graded GO / WATCH / SKIP, wire & volume, dilution traps, green ledger, and speed wins. Full mode adds extras.",
    tip: "Tap any ? icon if something is unclear · Esc exits the guide",
  },
  {
    id: "status",
    target: "trust-status",
    title: "Live status",
    body: "Shows whether the feed is fresh and the measured wire cycle. Trust the numbers.",
  },
  {
    id: "news-feed",
    target: "news-feed",
    title: "News feed",
    body: "Each row is graded from the headline and how the company is trading (move %, volume, float, history). Expand for the checklist and plain-English reasons.",
    tip: "Hotkeys: j/k · Enter · w watchlist · / search · 1/2/3 tabs",
  },
  {
    id: "market-monitor",
    target: "market-monitor",
    title: "Wire & volume",
    body: "What’s moving right now — HOD / volume alerts plus relative-volume leaders. Confirms whether the tape agrees with the news.",
  },
  {
    id: "dilution",
    target: "dilution-radar",
    title: "Dilution radar",
    body: "Offering / ATM spikes to skip. Tap “I skipped” to protect your green ledger.",
  },
  {
    id: "skip-ledger",
    target: "skip-ledger",
    title: "Green ledger",
    body: "Track skips and planned takes. Fewer bad trades over time — illustrative %, not brokerage P&L.",
  },
  {
    id: "wins-brief",
    target: "wins-brief",
    title: "Speed wins",
    body: "Fastest publish→feed catches from your wire. Shows RSS lag honestly when the live race is quiet.",
  },
  {
    id: "premarket",
    target: "premarket",
    title: "Premarket center",
    body: "Overnight movers before the open. Visible in Full mode.",
    requiresExtras: true,
  },
  {
    id: "catches",
    target: "catches-board",
    title: "Catches board",
    body: "Public proof wall. Full mode.",
    requiresExtras: true,
  },
  {
    id: "judgment",
    target: "judgment-toggle",
    title: "More tools (optional)",
    body: "Calls, edge, replay — only in Full mode so Focus stays calm.",
    tip: "Prop Desk = /desk",
    requiresExtras: true,
  },
  {
    id: "call-board",
    target: "call-board",
    title: "Call board",
    body: "Shared long / short / avoid / watch log.",
    requiresExtras: true,
  },
  {
    id: "daily-edge",
    target: "daily-edge",
    title: "Daily Edge Recap",
    body: "Illustrative scoreboard — not real brokerage P&L.",
    requiresExtras: true,
    tip: "Not financial advice",
  },
  {
    id: "done",
    title: "You’re set",
    body: "Work the feed. Prefer SKIP over FOMO. Log skips. Only GO when the checklist is clean.",
    tip: "Settings → alerts · Chrome overlay",
  },
];

export const DESK_GUIDE_STEPS: GuideStep[] = [
  {
    id: "desk-welcome",
    title: "Prop Desk mode",
    body: "A tighter layout for session intensity: judgment tools on the left, live feed on the right. Same data as the main scanner — less scrolling.",
  },
  {
    id: "desk-edge",
    target: "daily-edge",
    title: "Daily Edge Recap",
    body: "Keeps the “did Pro pay for itself?” math visible while you trade.",
  },
  {
    id: "desk-plan",
    target: "session-plan",
    title: "Session plan",
    body: "Suggested setups to focus on and skips (often dilution) before you force trades.",
  },
  {
    id: "desk-dilution",
    target: "dilution-radar",
    title: "Dilution radar",
    body: "Trap list for offerings — skip FOMO on names that are diluting.",
  },
  {
    id: "desk-calls",
    target: "call-board",
    title: "Call board",
    body: "Post and track calls. Filter to your watchlist when you only care about your book.",
  },
  {
    id: "desk-feed",
    target: "news-feed",
    title: "Live feed",
    body: "Same catalyst scanner with hotkeys. Expand rows for playbooks and paper stamps.",
  },
];
