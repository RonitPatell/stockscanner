/**
 * Platform Guide — single source of truth for the in-app tour.
 *
 * VERSION: bump PLATFORM_GUIDE_VERSION whenever steps change so returning
 * traders get prompted that the tour was updated.
 *
 * When you add/remove/rename major dashboard panels, update DASHBOARD_GUIDE_STEPS
 * (and DESK_GUIDE_STEPS if Prop Desk changed). Keep copy trader-plain.
 */

export const PLATFORM_GUIDE_VERSION = 30;

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
    body: "The desk uses five destinations: Feed, Watchlist, Plan, Risk, and Review. Session Plan, Dilution, and the Green Ledger are no longer pinned beside the live feed — open the matching tab when you need them.",
    tip: "Tap any ? icon if something is unclear · Esc exits the guide",
  },
  {
    id: "top-bar",
    target: "dashboard-top-bar",
    title: "Top bar",
    body: "Logo, ticker search, market session, live connection, and your profile. Search filters the feed without leaving the page.",
  },
  {
    id: "secondary-nav",
    target: "dashboard-secondary-nav",
    title: "Destinations",
    body: "Feed = live catalysts. Watchlist = your book + briefs. Plan = session / daily plan. Risk = dilution, wire & volume, halts. Review = ledger, feedback, autopsies, paper tools.",
  },
  {
    id: "connection",
    target: "connection-status",
    title: "Connection status",
    body: "One compact line: Live · last event age. Click for source, stream, and fallback detail. Latency targets are never claimed achieved without production verification and enough samples.",
    tip: "Full status page: /status",
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
    body: "Focus is a minimal live surface: at most five priority catalysts. Plan, Risk, and Review stay hidden until you Exit Focus. Ranking uses strategy match, watchlist, materiality, freshness, and critical risk — never predicted profit.",
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
    body: "Exit Focus restores Standard destinations. Squawk and the compact Live indicator stay on Focus. Enter opens the Decision Drawer for detail.",
    tip: "j/k navigate · Enter opens drawer",
  },
  {
    id: "context-drawer",
    target: "catalyst-context-drawer",
    title: "Decision Drawer",
    body: "Right-side Decision Drawer (overlay on tablet, sheet on mobile) shows Event → Reaction → Tradeability → Primary risks → Evidence, then Optional analysis (analogues, feedback) collapsed. Known tape and catalyst fields stay sticky once seen; empty optional rows are omitted instead of labeled Unavailable. Escape closes; j/k keeps it open on the next catalyst. Deep-link with ?cid=.",
    tip: "Source and TradingView stay in the header",
  },
  {
    id: "news-feed",
    target: "news-feed",
    title: "Standard Feed",
    body: "Collapsed rows show ticker, % move, direction (with icon), age, headline, then at most three context badges (risk · reaction · tradeability). Materiality and verification detail live in the Decision Drawer. Selected row uses a soft fill + left rail — not a bright outline.",
    tip: "Press ? for shortcuts · Visual gallery: /gallery",
  },
  {
    id: "visual-system",
    target: "visual-system-gallery-link",
    title: "Visual system gallery",
    body: "Open /gallery for feed rows, Decision Drawer sections, status, risk, empty, loading, and disconnected fixtures. Semantic colours: green/red direction, amber risk, cyan system, grey metadata, purple brand.",
  },
  {
    id: "plan",
    target: "plan-destination",
    title: "Plan",
    body: "Session Plan lists review candidates (with direction + materiality) and capital-caution names — not long/short buy instructions. Deep link: /dashboard?view=plan or /today.",
    requiresExtras: true,
  },
  {
    id: "risk",
    target: "risk-destination",
    title: "Risk",
    body: "Dilution radar, wire & volume, and halt references. Offerings and structural risk stay evidence-linked. Deep link: /dashboard?view=risk or ?panel=dilution.",
    requiresExtras: true,
  },
  {
    id: "review",
    target: "review-destination",
    title: "Review",
    body: "Green Ledger, trader feedback & autopsies, paper decisions, and speed tools. Local-first feedback until you opt in to sync. Deep link: /dashboard?view=review.",
    requiresExtras: true,
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
    body: "Work the Feed. Open Plan / Risk / Review when needed. Prefer capital caution over FOMO. In Settings, the Alert Strategy Builder versions every save.",
    tip: "Legacy desk: /dashboard?shell=legacy · Prop Desk: /desk",
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
