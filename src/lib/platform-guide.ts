/**
 * Platform Guide — single source of truth for the in-app tour.
 *
 * VERSION: bump PLATFORM_GUIDE_VERSION whenever steps change so returning
 * traders get prompted that the tour was updated.
 *
 * When you add/remove/rename major dashboard panels, update DASHBOARD_GUIDE_STEPS
 * (and DESK_GUIDE_STEPS if Prop Desk changed). Keep copy trader-plain.
 */

export const PLATFORM_GUIDE_VERSION = 23;

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
    id: "setup-checklist",
    target: "onboarding-checklist",
    title: "Setup checklist",
    body: "After signup (or if you skip the wizard), this checklist tracks focus, watchlist, alerts, and activation — five symbols, one channel, three expands, one test alert.",
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
    body: "Each row is graded from the headline and how the company is trading (move %, volume, float, history). Expand for the checklist and plain-English reasons. Coverage badges show why a ticker is monitored (watchlist, curated, gainer, SEC, etc.) — not a claim of full-market tape.",
    tip: "Hotkeys: j/k · Enter · w watchlist · / search · 1/2/3 tabs",
  },
  {
    id: "judgment-v2",
    target: "judgment-v2",
    title: "Judgment audit (V2)",
    body: "When enabled, expand a catalyst to see verified facts vs automated interpretation, missing data, strength/direction/timing/tradeability, score contributions, and feedback buttons. Not a personalized recommendation — always open the source link.",
  },
  {
    id: "focus-mode",
    target: "focus-mode-rail",
    title: "Focus Mode + Audio Squawk",
    body: "Focus Mode keeps at most five active catalysts ranked by watchlist match, freshness, and materiality — never predicted profit. Squawk reads a two-sentence structured summary (symbol, fact, source quality, move, RVol, tradeability, top risk). Mute, replay, quiet hours, and watchlist/risk-only filters are in Squawk controls. Live disconnect shows a clear warning.",
    tip: "Hotkeys: O source · T TradingView · W watchlist · U mute · E evidence",
  },
  {
    id: "historical-analogues",
    target: "historical-analogues",
    title: "Historical analogues",
    body: "On the Decision Card, load comparable past catalysts matched on category, session, float/liquidity buckets, and more. Shows median/percentile reactions and sample size — descriptive evidence only, never a target or win-rate promise. Tighten or loosen criteria to see how n changes.",
    tip: "Small samples are labelled on purpose",
  },
  {
    id: "coverage-badge",
    target: "coverage-badge",
    title: "Coverage badge",
    body: "Shows why a symbol is in the live universe (your watchlist, curated core, temporary gainer/volume/SEC/news). Temporary coverage expires. Official halt status (when HALT_OFFICIAL_URL is configured) appears on Decision Cards; otherwise headline-only halt language is labeled as such. See /halt-codes for code meanings — never a trade tip.",
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
    body: "SEC-backed capital risk (S-1/S-3, 424B5, ATM, directs, convertibles, warrants). Capacity ≠ sale; open evidence links. Tap “I skipped” for the green ledger.",
  },
  {
    id: "trader-feedback",
    target: "trader-feedback-panel",
    title: "Trader feedback & autopsy",
    body: "Mark watched, entered, skipped, or ignored — with optional entry/exit/size and a reason. Records stay on this device until you explicitly opt in to sync. Autopsies show age, stage, tradeability, risks, and MFE/MAE from your notes. Monthly summaries are factual counts — never “TrustTicker made you money.”",
    tip: "Export / delete anytime under Privacy",
  },
  {
    id: "live-connection",
    target: "live-connection-status",
    title: "Live connection status",
    body: "Shows feed, browser-stream, and in-app alert delivery health with sample sizes. Full indicators and incident timeline live on the public status page.",
    tip: "Open /status for definitions and targets (not guarantees until verified)",
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
    title: "Catalyst reaction",
    body: "Median |return|, reaction rate, and sample size after classified catalysts — calibration, not brokerage P&L. Optional illustrative $ view is behind a toggle.",
    requiresExtras: true,
    tip: "Not a profit guarantee",
  },
  {
    id: "done",
    title: "You’re set",
    body: "Work the feed. Prefer SKIP over FOMO. Log skips. Only GO when the checklist is clean. In Settings, the Alert Strategy Builder lets you build AND/OR rules (EARLY / CONFIRMED / RISK_ONLY) with cooldowns, mutes, and historical simulation — every save is versioned.",
    tip: "Settings → Alert Strategy Builder · Chrome overlay",
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
    title: "Catalyst reaction",
    body: "Normalized price-reaction stats for today’s classifications. Dollar scenarios stay optional and labelled.",
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
    body: "Filing evidence for offerings and shelves — capacity vs announced sale labeled. Skip FOMO; open the SEC link when unsure.",
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
