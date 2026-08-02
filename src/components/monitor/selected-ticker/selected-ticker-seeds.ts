import type { SelectedTickerSeed } from "./build-selected-ticker.ts";

/** Deterministic per-symbol intelligence seeds for Monitor fixtures. */
export function buildFixtureIntelSeeds(
  connection: string,
  nowMs = Date.now()
): Record<string, SelectedTickerSeed> {
  const delayed = connection === "delayed";
  const partial = connection === "partial_outage";

  return {
    AAAA: {
      company: "Alpha Analytics Inc",
      price: 4.82,
      sessionChangePct: 12.4,
      reactionStage: "Extension",
      tradeability: "Thin — inspect spread before size",
      dataConfidence: delayed
        ? "Low — delayed prints"
        : partial
          ? "Reduced — quote provider degraded"
          : "Adequate for inspection",
      catalyst: {
        fact: "Company announced a contract expansion with a major hospital network.",
        sourceName: "Business Wire",
        sourceUrl: "https://example.com/aaaa-pr",
        publishedAt: new Date(nowMs - 18 * 60_000).toISOString(),
        firstSeenAt: new Date(nowMs - 17 * 60_000).toISOString(),
        confirmationLevel: "Medium (52)",
        ageSec: 18 * 60,
      },
      // Intentionally missing event price — must stay Unavailable.
      priceAtCatalyst: null,
      tradesPerSecond: 18.4,
      dollarVolumeVelocity: 420_000,
      relativeVolume: 6.2,
      spreadDollars: 0.02,
      spreadBps: 42,
      hodContext: "−0.8% below session high",
      lodContext: "+3.1% above session low",
      vwapContext: "+1.2% vs VWAP",
      risks: {
        dilution: { status: "clear" },
        offering: { status: "clear" },
        atm: { status: "unavailable", detail: "No ATM filing linked" },
        warrants: { status: "clear" },
        reverse_split: { status: "clear" },
        halt: { status: "clear" },
        stale_news: { status: "clear" },
        wide_spread: { status: "clear" },
        ambiguous_data: {
          status: "active",
          detail: "Price at catalyst missing",
        },
        extended_reaction: {
          status: "active",
          detail: "Move already extended vs open",
        },
      },
      timeline: [
        {
          id: "aaaa-cat",
          atMs: nowMs - 18 * 60_000,
          kind: "catalyst",
          summary: "Contract expansion PR ingested",
        },
        {
          id: "aaaa-brk",
          atMs: nowMs - 12 * 60_000,
          kind: "momentum_transition",
          summary: "EMERGING → BREAKING",
        },
        {
          id: "aaaa-hod",
          atMs: nowMs - 8 * 60_000,
          kind: "hod",
          summary: "Session high print",
        },
      ],
      evidence: {
        primarySource: "Business Wire press release",
        primarySourceUrl: "https://example.com/aaaa-pr",
        secFilings: [],
        supportingFacts: [
          "Headline classified as contract / commercial win",
        ],
        missingOrUncertain: [
          "Price at catalyst time not captured — move since catalyst unavailable",
        ],
      },
      collapsed: {
        historicalAnalogues: "3 loose analogues — inspect separately",
        personalFeedback: "No personal notes yet",
        autopsy: "Unavailable — no closed session autopsy",
        additionalMarketStatistics: [
          "Float (est.): 18.2M",
          "Session dollar volume: $4.1M",
        ],
      },
    },
    BBBB: {
      company: "Beta Bio Devices",
      price: 2.15,
      sessionChangePct: 28.6,
      reactionStage: "Discovery",
      tradeability: "Acceptable — elevated RVol",
      dataConfidence: "Adequate for inspection",
      catalyst: {
        fact: "FDA cleared a 510(k) for the company's diagnostic cartridge.",
        sourceName: "GlobeNewswire",
        sourceUrl: "https://example.com/bbbb-fda",
        publishedAt: new Date(nowMs - 42 * 60_000).toISOString(),
        firstSeenAt: new Date(nowMs - 41 * 60_000).toISOString(),
        confirmationLevel: "High (78)",
        ageSec: 42 * 60,
      },
      priceAtCatalyst: 1.72,
      tradesPerSecond: 24.1,
      dollarVolumeVelocity: 890_000,
      relativeVolume: 11.4,
      spreadDollars: 0.01,
      spreadBps: 28,
      hodContext: "−1.4% below session high",
      lodContext: "+19.2% above session low",
      vwapContext: "+4.8% vs VWAP",
      risks: {
        dilution: { status: "active", detail: "Recent S-3 shelf" },
        offering: { status: "clear" },
        atm: { status: "active", detail: "ATM program disclosed" },
        warrants: { status: "clear" },
        reverse_split: { status: "clear" },
        halt: { status: "clear" },
        stale_news: { status: "clear" },
        wide_spread: { status: "clear" },
        ambiguous_data: { status: "clear" },
        extended_reaction: { status: "clear" },
      },
      timeline: [
        {
          id: "bbbb-cat",
          atMs: nowMs - 42 * 60_000,
          kind: "catalyst",
          summary: "FDA 510(k) clearance — verified",
        },
        {
          id: "bbbb-bld",
          atMs: nowMs - 30 * 60_000,
          kind: "momentum_transition",
          summary: "BUILDING participation",
        },
        {
          id: "bbbb-risk",
          atMs: nowMs - 20 * 60_000,
          kind: "risk_change",
          summary: "ATM program flagged from S-3",
        },
      ],
      evidence: {
        primarySource: "GlobeNewswire / company PR",
        primarySourceUrl: "https://example.com/bbbb-fda",
        secFilings: ["S-3 shelf (linked)"],
        supportingFacts: ["Classification confidence high", "Single confirming wire"],
        missingOrUncertain: [],
      },
      collapsed: {
        historicalAnalogues: "2 FDA-clearance analogues in lookback",
        personalFeedback: "Unavailable",
        autopsy: "Unavailable",
        additionalMarketStatistics: ["Bid×Ask size: 8.2K × 6.1K"],
      },
    },
    FFFF: {
      company: "Forge Freight Ltd",
      price: 1.04,
      sessionChangePct: 6.1,
      reactionStage: "Halted",
      tradeability: "Unavailable — trading halt",
      dataConfidence: "Reduced — halt window",
      catalyst: null,
      priceAtCatalyst: null,
      tradesPerSecond: 0,
      dollarVolumeVelocity: 0,
      relativeVolume: 2.1,
      spreadDollars: null,
      spreadBps: null,
      hodContext: "Unavailable during halt",
      lodContext: "Unavailable during halt",
      vwapContext: "Unavailable during halt",
      risks: {
        dilution: { status: "unavailable" },
        offering: { status: "unavailable" },
        atm: { status: "unavailable" },
        warrants: { status: "unavailable" },
        reverse_split: { status: "unavailable" },
        halt: { status: "active", detail: "LULD / news pending" },
        stale_news: { status: "unavailable" },
        wide_spread: { status: "unavailable" },
        ambiguous_data: { status: "active", detail: "Quotes paused" },
        extended_reaction: { status: "unavailable" },
      },
      timeline: [
        {
          id: "ffff-halt",
          atMs: nowMs - 5 * 60_000,
          kind: "halt",
          summary: "Trading halt — critical",
        },
      ],
      evidence: {
        primarySource: null,
        primarySourceUrl: null,
        secFilings: [],
        supportingFacts: [],
        missingOrUncertain: [
          "Official halt code reconciliation pending",
          "No linked catalyst fact",
        ],
      },
      collapsed: {
        historicalAnalogues: "Unavailable",
        personalFeedback: "Unavailable",
        autopsy: "Unavailable",
        additionalMarketStatistics: [],
      },
    },
  };
}
