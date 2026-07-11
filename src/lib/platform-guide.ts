/**
 * Platform Guide — single source of truth for the in-app tour.
 *
 * VERSION: bump PLATFORM_GUIDE_VERSION whenever steps change so returning
 * traders get prompted that the tour was updated.
 *
 * When you add/remove/rename major dashboard panels, update DASHBOARD_GUIDE_STEPS
 * (and DESK_GUIDE_STEPS if Prop Desk changed). Keep copy trader-plain.
 */

export const PLATFORM_GUIDE_VERSION = 3;

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
    body: "This quick tour explains what each panel is for. You can reopen it anytime with the Guide button (bottom-right).",
    tip: "Takes about 60 seconds · Esc to exit",
  },
  {
    id: "status",
    target: "trust-status",
    title: "Trust / live status",
    body: "Shows whether the feed is fresh, if ingest is running, and how healthy the pipeline is. Green pulse = live.",
  },
  {
    id: "premarket",
    target: "premarket",
    title: "Premarket center",
    body: "Before the open: overnight movers and gap context so you walk into the session with a plan.",
  },
  {
    id: "market-monitor",
    target: "market-monitor",
    title: "Wire Alerts + High Volume",
    body: "Your core tape tools. Wire Alerts flag HOD / retests / volume events. High Volume shows relative-volume leaders. Market state and earnings sit underneath.",
    tip: "This is the main “what’s moving right now” block",
  },
  {
    id: "wins-brief",
    target: "wins-brief",
    title: "Speed wins & watchlist brief",
    body: "Speed wins prove we caught catalysts fast (auditable). Watchlist brief summarizes what matters on your names for morning / EOD.",
  },
  {
    id: "catches",
    target: "catches-board",
    title: "Catches board",
    body: "Public proof wall: fastest/impressive catches plus top call-board callers. Social proof that compounds.",
  },
  {
    id: "news-feed",
    target: "news-feed",
    title: "Live catalyst feed",
    body: "Stock-impact headlines only. Expand a row for playbooks (Long/Short/Watch/Skip), charts, paper trades, and call buttons. Tabs: All · Premarket · Watchlist.",
    tip: "Hotkeys: j/k navigate · Enter expand · w watchlist · / search · 1/2/3 tabs · broker links on expand",
  },
  {
    id: "judgment",
    target: "judgment-toggle",
    title: "Judgment tools (optional)",
    body: "Dilution radar, call board, daily edge, sympathy map, and more live here so they don’t bury Wire Alerts. Click “Show judgment tools” or use Prop Desk for a focused layout.",
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
    body: "Illustrative scoreboard: paper speed edge + dilution skips + paper trades, framed against your $19.99 month — did Pro pay for itself today?",
    requiresExtras: true,
    tip: "Not real brokerage P&L · not financial advice",
  },
  {
    id: "done",
    title: "You’re set",
    body: "Trade from Wire Alerts + the news feed. Open judgment tools when you need trap filters or proof. Reopen this Guide anytime you’re unsure.",
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
