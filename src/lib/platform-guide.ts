/**
 * Platform Guide — single source of truth for the in-app tour.
 *
 * VERSION: bump PLATFORM_GUIDE_VERSION whenever steps change so returning
 * traders get prompted that the tour was updated.
 *
 * When you add/remove/rename major dashboard panels, update DASHBOARD_GUIDE_STEPS
 * (and DESK_GUIDE_STEPS if Prop Desk changed). Keep copy trader-plain.
 */

export const PLATFORM_GUIDE_VERSION = 8;

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
    body: "The catalyst feed is your main work surface. On a wide screen, market context sits beside it; on smaller screens, the feed stays first and the context panels continue below.",
    tip: "Takes about 60 seconds · Esc to exit · Focus keeps the desk calm",
  },
  {
    id: "status",
    target: "trust-status",
    title: "Live status",
    body: "Shows whether the feed is fresh, if ingest is running, and how healthy the pipeline is. Green pulse = live.",
  },
  {
    id: "news-feed",
    target: "news-feed",
    title: "Catalyst feed (center of the desk)",
    body: "Stock-impact headlines only. Expand a row for playbooks (Long/Short/Watch/Skip), charts, paper trades, and call buttons. Tabs: All · Premarket · Watchlist.",
    tip: "Hotkeys: j/k navigate · Enter expand · w watchlist · / search · 1/2/3 tabs",
  },
  {
    id: "market-monitor",
    target: "market-monitor",
    title: "Wire Alerts + Heavy Volume",
    body: "What’s moving right now. Wire flags HOD / retests / volume events. Heavy Volume ranks relative-volume leaders. Each panel keeps a usable height and can expand when you want a dedicated view.",
    tip: "Use Expand on a panel to enlarge it · Minimize to shrink it back",
  },
  {
    id: "premarket",
    target: "premarket",
    title: "Premarket center",
    body: "Before the open: overnight movers and gap context so you walk into the session with a plan. Visible in Full mode.",
  },
  {
    id: "wins-brief",
    target: "wins-brief",
    title: "Speed wins & watchlist brief",
    body: "Speed wins prove we caught catalysts fast (auditable). Watchlist brief summarizes what matters on your names.",
  },
  {
    id: "catches",
    target: "catches-board",
    title: "Catches board",
    body: "Public proof wall: fastest catches plus top call-board callers.",
  },
  {
    id: "judgment",
    target: "judgment-toggle",
    title: "Judgment tools (optional)",
    body: "Dilution radar, call board, daily edge, sympathy map, and more live under the tape so they don’t bury the feed. Or open Prop Desk for a focused layout.",
    tip: "Prop Desk = /desk",
  },
  {
    id: "dilution",
    target: "dilution-radar",
    title: "Dilution radar",
    body: "Surfaces offerings / ATM / dilution headlines so you don’t FOMO-buy a spike that’s about to get sold into.",
    requiresExtras: true,
  },
  {
    id: "call-board",
    target: "call-board",
    title: "Call board",
    body: "Prop-style shared log: post long / short / avoid / watch on a ticker. See who called it and how it’s trading since.",
    requiresExtras: true,
  },
  {
    id: "daily-edge",
    target: "daily-edge",
    title: "Daily Edge Recap",
    body: "Illustrative scoreboard: paper speed edge + dilution skips + paper trades — framed against your Pro month.",
    requiresExtras: true,
    tip: "Not real brokerage P&L · not financial advice",
  },
  {
    id: "done",
    title: "You’re set",
    body: "Work the feed. Glance left for wire/volume. Open judgment tools only when you need trap filters or proof.",
    tip: "Settings → alerts, Discord, SMS, email briefs",
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
