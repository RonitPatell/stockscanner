/**
 * Platform Guide — single source of truth for the in-app tour.
 *
 * VERSION: bump PLATFORM_GUIDE_VERSION whenever steps change so returning
 * traders get prompted that the tour was updated.
 *
 * When you add/remove/rename major dashboard panels, update DASHBOARD_GUIDE_STEPS
 * (and DESK_GUIDE_STEPS if Prop Desk changed). Keep copy trader-plain.
 */

export const PLATFORM_GUIDE_VERSION = 10;

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
    body: "Focus mode is the default: catalyst feed + wire/volume + dilution + skip ledger. Full mode adds premarket, wins, and the rest of the toolbox.",
    tip: "Takes about 60 seconds · Esc to exit · stay in Focus during the open",
  },
  {
    id: "status",
    target: "trust-status",
    title: "Live status",
    body: "Shows whether the feed is fresh, measured wire cycle (how often ingest actually runs), and avg ingest delay. Trust the numbers — not marketing.",
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
    body: "What’s moving right now — news names plus a rotating liquid-ticker scan for relative volume. Each panel can expand when you want a dedicated view.",
    tip: "Use Expand on a panel to enlarge it · Minimize to shrink it back",
  },
  {
    id: "dilution",
    target: "dilution-radar",
    title: "Dilution radar",
    body: "Surfaces offerings / ATM / dilution headlines so you don’t FOMO-buy a spike that’s about to get sold into. Tap “I skipped” to log it.",
  },
  {
    id: "skip-ledger",
    target: "skip-ledger",
    title: "Skip ledger",
    body: "Your personal retention loop: dilution spikes you passed, with illustrative % / $ avoided. This is why Pro pays for itself — skip discipline, not more noise.",
  },
  {
    id: "premarket",
    target: "premarket",
    title: "Premarket center",
    body: "Before the open: overnight movers and gap context so you walk into the session with a plan. Visible in Full mode.",
    requiresExtras: true,
  },
  {
    id: "wins-brief",
    target: "wins-brief",
    title: "Speed wins & watchlist brief",
    body: "Speed wins prove we caught catalysts fast (auditable). Watchlist brief summarizes what matters on your names.",
    requiresExtras: true,
  },
  {
    id: "catches",
    target: "catches-board",
    title: "Catches board",
    body: "Public proof wall: fastest catches plus top call-board callers.",
    requiresExtras: true,
  },
  {
    id: "judgment",
    target: "judgment-toggle",
    title: "Judgment tools (optional)",
    body: "Call board, daily edge, sympathy map, and more live under the tape. Dilution stays in Focus so you never miss traps.",
    tip: "Prop Desk = /desk",
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
    body: "Work the feed. Skip dilution. Open judgment tools only when you need calls or proof. Check Settings for Chrome overlay + alerts.",
    tip: "Settings → alerts, Discord, SMS, email briefs, Chrome overlay",
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
