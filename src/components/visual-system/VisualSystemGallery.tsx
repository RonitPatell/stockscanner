"use client";

/**
 * Static visual-system gallery — fixtures only, no live APIs or user data.
 */
import type { ReactNode } from "react";
import { CatalystFeedRowV3 } from "@/components/catalyst-feed/CatalystFeedRowV3";
import { FocusCatalystRowV2 } from "@/components/focus/FocusCatalystRowV2";
import { DecisionDrawerContent } from "@/components/decision-drawer/DecisionDrawerContent";
import { VISUAL_SYSTEM_VERSION } from "@/lib/visual-system";
import type { CatalystItem } from "@/types";
import type { JudgmentV2 } from "@/lib/judgment/types";

const judgment: JudgmentV2 = {
  version: "judgment-v2.0",
  classifiedAt: new Date().toISOString(),
  verifiedFacts: ["Company prices $40M registered direct offering."],
  automatedInterpretation: ["Dilutive capital raise"],
  missingOrUncertain: ["Warrant coverage not confirmed in headline"],
  catalystStrength: "STRONG",
  directionalImplication: "NEGATIVE",
  timing: "IMMEDIATE",
  tradeability: "THIN",
  confidence: "HIGH",
  riskFlags: [
    {
      id: "offering",
      label: "Registered offering",
      severity: "high",
      detail: "Dilutive capital raise language",
    },
  ],
  scoreContributions: [],
  grade: "skip",
  gradeLabel: "SKIP",
  gradeRationale: "Offering risk",
  disclaimer: "Not financial advice",
  changeLog: [],
};

const fixturePositive: CatalystItem = {
  id: "gallery-pos-1",
  symbol: "NVDA",
  headline: "Nvidia raises data-centre outlook on AI demand",
  source: "Business Wire",
  sourceUrl: "https://example.com/nvda",
  publishedAt: new Date(Date.now() - 4 * 60_000).toISOString(),
  ingestedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
  changePercent: 6.42,
  price: 128.5,
  verifiedConfidence: 88,
  urgencyScore: 72,
  catalystType: "analyst",
  rVol: 3.2,
  floatShares: 2.4e9,
  volume: 12_000_000,
  avgVolume: 4_000_000,
  judgmentV2: {
    ...judgment,
    directionalImplication: "POSITIVE",
    tradeability: "LIQUID",
    riskFlags: [],
    verifiedFacts: ["Data-centre revenue estimates raised."],
    missingOrUncertain: [],
    grade: "go",
    gradeLabel: "GO",
  },
};

const fixtureRisk: CatalystItem = {
  id: "gallery-risk-1",
  symbol: "ABCD",
  headline: "ABCD announces $40M registered direct offering",
  source: "SEC EDGAR",
  sourceUrl: "https://example.com/abcd",
  publishedAt: new Date(Date.now() - 12 * 60_000).toISOString(),
  ingestedAt: new Date(Date.now() - 11 * 60_000).toISOString(),
  changePercent: -18.4,
  price: 1.12,
  verifiedConfidence: 90,
  urgencyScore: 85,
  catalystType: "offering",
  rVol: 8.1,
  floatShares: 12_000_000,
  volume: 5_000_000,
  avgVolume: 600_000,
  judgmentV2: judgment,
};

const fixtureMuted: CatalystItem = {
  ...fixturePositive,
  id: "gallery-muted-1",
  symbol: "MSFT",
  changePercent: 0.4,
};

function GalleryBlock({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      data-gallery-section={id}
      className="tt-stack-card"
      aria-labelledby={`gal-${id}`}
    >
      <h2 id={`gal-${id}`} className="tt-section-title">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function VisualSystemGallery() {
  return (
    <div
      className="tt-stack-section max-w-5xl mx-auto px-4 py-6"
      data-visual-system={VISUAL_SYSTEM_VERSION}
      data-testid="visual-system-gallery"
    >
      <header className="space-y-2 border-b border-[var(--border)] pb-4">
        <p className="tt-label tt-tone-brand">TrustTicker visual system</p>
        <h1 className="tt-page-title">Component gallery</h1>
        <p className="tt-meta max-w-2xl">
          Fixture surfaces for feed rows, Decision Drawer, status, risk, empty,
          loading, and disconnected states. Colour is never the only signal.
        </p>
      </header>

      <GalleryBlock id="feed-rows" title="Feed rows">
        <div className="desk-panel desk-panel--raised overflow-hidden">
          <CatalystFeedRowV3 catalyst={fixturePositive} inWatchlist highlighted />
          <CatalystFeedRowV3 catalyst={fixtureRisk} />
          <CatalystFeedRowV3 catalyst={fixtureMuted} muted />
        </div>
        <div className="desk-panel mt-3 overflow-hidden">
          <FocusCatalystRowV2 catalyst={fixtureRisk} highlighted />
          <FocusCatalystRowV2 catalyst={fixturePositive} />
        </div>
      </GalleryBlock>

      <GalleryBlock id="decision-drawer" title="Decision Drawer sections">
        <div
          className="desk-panel desk-panel--raised max-h-[640px] overflow-hidden"
          data-testid="gallery-drawer"
        >
          <DecisionDrawerContent catalyst={fixtureRisk} className="h-[640px]" />
        </div>
      </GalleryBlock>

      <GalleryBlock id="status" title="Status indicators">
        <div className="tt-stack-meta">
          <span className="tt-status" data-state="live">
            <span className="tt-status-dot" aria-hidden />
            Live
          </span>
          <span className="tt-status" data-state="connecting">
            <span className="tt-status-dot" aria-hidden />
            Connecting
          </span>
          <span className="tt-status" data-state="disconnected">
            <span className="tt-status-dot" aria-hidden />
            Disconnected
          </span>
          <span className="tt-status" data-state="warn">
            <span className="tt-status-dot" aria-hidden />
            Degraded
          </span>
        </div>
      </GalleryBlock>

      <GalleryBlock id="risk" title="Risk alerts">
        <div className="tt-risk-alert" role="status">
          <p className="text-[14px] font-medium tt-tone-risk">
            Registered offering · high
          </p>
          <p className="tt-meta mt-1">
            Dilutive capital event flagged from filing language. Confirm terms
            in the source before sizing.
          </p>
        </div>
      </GalleryBlock>

      <GalleryBlock id="empty" title="Empty states">
        <div className="tt-empty" data-testid="gallery-empty">
          No priority catalysts right now. Adjust Focus rules or review the
          full feed.
        </div>
      </GalleryBlock>

      <GalleryBlock id="loading" title="Loading states">
        <div className="tt-loading space-y-2" data-testid="gallery-loading">
          <div className="tt-skeleton w-2/3" />
          <div className="tt-skeleton w-full" />
          <div className="tt-skeleton w-5/6" />
          <p className="tt-meta pt-1">Loading catalysts…</p>
        </div>
      </GalleryBlock>

      <GalleryBlock id="error" title="Error and disconnected">
        <div className="tt-error" data-testid="gallery-error" role="alert">
          Feed disconnected. Reconnecting automatically — last update
          unavailable.
        </div>
      </GalleryBlock>

      <GalleryBlock id="tones" title="Semantic tones">
        <div className="tt-stack-meta">
          <span className="tt-badge" data-tone="positive">
            Positive +2.4%
          </span>
          <span className="tt-badge" data-tone="negative">
            Negative −8.1%
          </span>
          <span className="tt-badge" data-tone="risk">
            Risk · offering
          </span>
          <span className="tt-badge" data-tone="system">
            Verified
          </span>
          <span className="tt-badge" data-tone="meta">
            12m ago
          </span>
          <span className="tt-badge" data-tone="brand">
            Watchlist
          </span>
        </div>
        <p className="tt-meta">
          Green = positive direction · Red = negative · Amber = risk · Cyan =
          system/verification · Grey = metadata · Purple = brand/nav.
        </p>
      </GalleryBlock>
    </div>
  );
}
