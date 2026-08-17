/**
 * Platform Guide — single source of truth for the in-app tour.
 *
 * VERSION: bump PLATFORM_GUIDE_VERSION whenever steps change so returning
 * traders get prompted that the tour was updated.
 *
 * When you add/remove/rename major dashboard panels, update DASHBOARD_GUIDE_STEPS
 * (and DESK_GUIDE_STEPS if Prop Desk changed). Keep copy trader-plain.
 */

export const PLATFORM_GUIDE_VERSION = 61;

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
    title: "Welcome to TrustTicker",
    body: "Investor OS: Portfolio is where you choose companies to monitor. Watchtower surfaces material changes on those names. Research opens ticker hubs. Discover is for market-wide opportunity rules (rolling out).",
    tip: "Tap any ? icon if something is unclear · Esc exits the guide",
  },
  {
    id: "secondary-nav",
    target: "dashboard-secondary-nav",
    title: "View switcher",
    body: "Portfolio · Watchtower · Research · Discover. Markets and Structure remain available via deep links for power users.",
  },
  {
    id: "portfolio",
    target: "watchlist-destination",
    title: "Portfolio",
    body: "Add or remove companies you own or follow. Optional label, note, and entry price. Quotes enrich when available; monitoring works without live prices.",
  },
  {
    id: "watchtower-desk",
    target: "watchtower-desk",
    title: "Watchtower",
    body: "Material changes across the companies you monitor — filings, capital, ownership, and more. Filter by significance or category. Open a card for detail, source, and mark-as-read. Not buy/sell advice.",
  },
  {
    id: "research-desk",
    target: "research-desk",
    title: "Research",
    body: "Look up any ticker. Opens the hub with Overview, What Changed, Thesis (conditions you monitor), Financials (Quarterly Delta), and more tabs. Form 4 context, EDGAR links, and dilution badges stay on Overview.",
  },
  {
    id: "discover-desk",
    target: "discover-desk",
    title: "Discover",
    body: "Market-wide opportunity rules will land here. Until then, monitor names in Portfolio and review changes in Watchtower.",
  },
  {
    id: "trading-floor",
    target: "trading-floor",
    title: "Markets Floor",
    body: "Deep-link desk for volume and biggest % leaders, wire, and charts. Open with ?view=markets. Search any ticker for float and market cap.",
  },
  {
    id: "structure-desk",
    target: "structure-desk",
    title: "Structure Desk",
    body: "Deep-link capital risk: can new share supply crush this move? Dilution Radar reads SEC capital filings with evidence links. Open with ?view=structure.",
  },
  {
    id: "dilution-radar",
    target: "dilution-radar",
    title: "Dilution Radar",
    body: "Live capital-structure alerts from EDGAR. Open the filing. Skip names that look like supply traps.",
    requiresExtras: true,
  },
  {
    id: "floor-wire",
    target: "floor-wire",
    title: "Wire alerts",
    body: "Notifications when names surge on volume, hit highs, or show momentum. Click an alert to load that symbol on the chart.",
    requiresExtras: true,
  },
  {
    id: "monitor-beta",
    target: "monitor-beta-chrome",
    title: "Scanner beta controls",
    body: "Only on the Scanner view. During staged rollout you can open the old dashboard, opt out of Scanner beta, and send feedback. Technical errors are captured without private financial notes.",
    tip: "Floor and News stay available if you opt out",
  },
  {
    id: "monitor-status",
    target: "monitor-status-bar",
    title: "Scanner status bar",
    body: "Command chrome: market session, connection (Live / Degraded / Disconnected / Recovered), last event age, snapshot age, search, active strategy preset, Squawk, and profile. Quiet markets stay empty — no fake tickers. Outages name user-facing categories and link to /status.",
    requiresExtras: true,
  },
  {
    id: "monitor-session",
    target: "monitor-session",
    title: "Market session",
    body: "Shows the current US equity session segment so you know whether you are in premarket, regular, or after-hours context.",
    requiresExtras: true,
  },
  {
    id: "monitor-connection",
    target: "monitor-connection",
    title: "Stream state",
    body: "Live shows a steady status mark. Degraded is amber with a plain-language reason. Disconnected is red with recovery context. After reconnect you briefly see Recovered, then back to Live. Snapshot age sits next to Event age on first paint so you know how old the server seed is while live sync catches up.",
    requiresExtras: true,
  },
  {
    id: "monitor-filter",
    target: "monitor-filter-preset",
    title: "List filters",
    body: "Primary toggle: All / Watchlist / Strategy. Extra filters (Upward, Downward, Risk, Halted) sit under More. Changes which names you inspect — not a trade filter.",
    requiresExtras: true,
  },
  {
    id: "monitor-preset",
    target: "monitor-preset",
    title: "Strategy presets",
    body: "Active preset lives in the status bar. Open it for Alert Strategy Builder templates: Low-Float Momentum, Biotech Catalysts, Large-Cap News, Downside Momentum, Halt and Resumption, Dilution and Offering Risk, Watchlist Only, or Custom. Plain-language summary, validation, export/import, replay preview, and match explains. Saved presets are never changed silently.",
    requiresExtras: true,
  },
  {
    id: "monitor-search",
    target: "monitor-search",
    title: "Scanner search",
    body: "Jump to a symbol in the priority list without leaving the Scanner panel.",
    requiresExtras: true,
  },
  {
    id: "monitor-squawk",
    target: "monitor-squawk",
    title: "Squawk",
    body: "Status-bar control opens mute, replay, and transcript. Speaks only high-value transitions (verified catalyst, attention leader, momentum breaking, official halt/resumption, high-severity dilution/offering, critical data degradation). Never raw articles, returns, or trade instructions.",
    requiresExtras: true,
  },
  {
    id: "monitor-profile",
    target: "monitor-profile",
    title: "Profile",
    body: "Account menu for settings and sign-out. Same profile control as the rest of the desk.",
    requiresExtras: true,
  },
  {
    id: "monitor-ladder",
    target: "monitor-priority-ladder",
    title: "Priority names",
    body: "Left column: ranked list (rank, ticker, state, one-line reason). Click a row to load detail on the right. Pin / mute / watchlist from the row. Minor score changes do not constantly reshuffle — critical events may.",
    requiresExtras: true,
  },
  {
    id: "monitor-field",
    target: "monitor-momentum-field",
    title: "Activity map (optional)",
    body: "Off by default. Use Show map for an optional spatial view of active names. Prefer the priority list for day-to-day reading. List view inside the map mirrors the same data. Not a trade cue.",
    requiresExtras: true,
  },
  {
    id: "monitor-intel",
    target: "monitor-intelligence",
    title: "Selected-ticker detail",
    body: "Right column for the name you clicked: essentials stay usable from the snapshot while filings, analogues, feedback, and autopsy load in isolated panels. A slow secondary never blanks the list. Failures show Retry on that panel only.",
    requiresExtras: true,
  },
  {
    id: "monitor-tape",
    target: "monitor-event-tape",
    title: "Event tape",
    body: "Bottom strip of inspection events — quiet unless severity is high/critical. Filters: All, Selected, Watchlist, Risk, Market. Click to focus the ticker and jump to the matching detail section. Labels are not trade instructions.",
    requiresExtras: true,
  },
  {
    id: "top-bar",
    target: "dashboard-top-bar",
    title: "Desk top bar",
    body: "Logo, search, desk health, market session, stream connection, and profile — shared across the whole page.",
    requiresExtras: true,
  },
  {
    id: "trust-status",
    target: "trust-status",
    title: "Desk health",
    body: "Live / Catching up / Stale news based on the newest headline’s publish time. Scans ≈ wire poll cadence. Desk Xs = median processing after a catch.",
    tip: "Full status page: /status",
    requiresExtras: true,
  },
  {
    id: "live-tape-chart",
    target: "live-tape-chart",
    title: "Chart",
    body: "Dedicated 1‑minute TradingView chart for the selected headline. Click any news row to load that ticker — works for NYSE and NASDAQ (not NASDAQ-only).",
    requiresExtras: true,
  },
  {
    id: "connection",
    target: "connection-status",
    title: "Connection status",
    body: "Stream link to your browser: Live · last event age. Click for source and fallback detail. Separate from desk health (headline freshness).",
    tip: "Full status page: /status",
    requiresExtras: true,
  },
  {
    id: "setup-checklist",
    target: "onboarding-checklist",
    title: "Setup checklist",
    body: "After signup (or if you skip the wizard), this checklist tracks focus, watchlist, alerts, and activation — five symbols, one channel, three expands, one test alert.",
  },
  {
    id: "focus-enter",
    target: "focus-mode-rail",
    title: "Focus Mode",
    body: "Focus is a minimal live surface: at most five priority catalysts. The desk switches to the News view until you Exit Focus. Ranking uses strategy match, watchlist, materiality, freshness, and critical risk — never predicted profit.",
    tip: "Enter Focus from Standard, or open /dashboard?focus=1",
  },
  {
    id: "focus-row",
    target: "focus-row-guide",
    title: "Five questions per row",
    body: "Each Focus row answers: what happened, is it material, is the reaction early/active, is it tradeable, and what is the primary risk. Larger headlines than Standard. Empty state never pads with weak events.",
  },
  {
    id: "focus-exit",
    target: "exit-focus-guide",
    title: "Exit Focus & Squawk",
    body: "Exit Focus returns you to a full News desk. Squawk and the compact Live indicator stay on Focus. Enter opens the Decision Drawer for detail.",
    tip: "j/k navigate · Enter opens drawer",
  },
  {
    id: "context-drawer",
    target: "catalyst-context-drawer",
    title: "Decision Drawer",
    body: "Right-side Decision Drawer (overlay on tablet, sheet on mobile) shows Event → Reaction → Tradeability → Primary risks → Evidence, then Optional analysis (analogues, feedback) collapsed. Escape closes; j/k keeps it open on the next catalyst. Deep-link with ?cid=.",
    tip: "Source and TradingView stay in the header",
  },
  {
    id: "news-feed",
    target: "news-feed",
    title: "News",
    body: "Headlines sit on the Floor (right column) and expand in the News view. Click a row to load the chart. Press Enter on News for the Decision Drawer.",
    tip: "T opens full TradingView · Enter opens Decision Drawer",
  },
  {
    id: "visual-system",
    target: "visual-system-gallery-link",
    title: "Visual system gallery",
    body: "Open /gallery for feed rows, Decision Drawer sections, status, risk, empty, loading, and disconnected fixtures. Semantic colours: green/red direction, amber risk, cyan system, grey metadata, purple brand.",
  },
  {
    id: "judgment-v2",
    target: "judgment-v2",
    title: "Judgment audit (V2)",
    body: "Five dimensions: Materiality, Directional implication, Reaction stage, Tradeability, and top Risk. Legacy GO/WATCH/SKIP may exist in storage for compatibility but is not the primary label. Not a personalized recommendation — always open the source link.",
  },
  {
    id: "historical-analogues",
    target: "historical-analogues",
    title: "Historical analogues",
    body: "Comparable past catalysts with median/percentile reactions and sample size — descriptive only, never a target or win-rate promise.",
    tip: "Small samples are labelled on purpose",
  },
  {
    id: "done",
    title: "You’re set",
    body: "Stay on Floor for movers, wire, news, and chart. Use News or Watchlist when you want a dedicated layout. Prefer capital caution over FOMO.",
    tip: "Legacy desk: /dashboard?shell=legacy",
  },
];

export const DESK_GUIDE_STEPS: GuideStep[] = [
  {
    id: "desk-welcome",
    title: "Prop Desk",
    body: "Same Trading Floor idea in a tighter frame: movers and wire stay visible with the live feed.",
  },
  {
    id: "desk-floor",
    target: "trading-floor",
    title: "Floor first",
    body: "Heavy volume, biggest movers, wire alerts, news, and chart — click a symbol to focus.",
  },
  {
    id: "desk-wire",
    target: "floor-wire",
    title: "Wire",
    body: "Realtime surge / high-of-day / momentum notices so you do not miss loud names.",
  },
  {
    id: "desk-feed",
    target: "news-feed",
    title: "News",
    body: "Session headlines with active names sorted first. Open News view for the full tape.",
  },
];
