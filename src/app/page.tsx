import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import {
  MarketingLanding,
  LANDING_FAQ_FOR_SCHEMA,
} from "@/components/landing/MarketingLanding";
import { FunnelViewBeacon } from "@/components/FunnelViewBeacon";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasActiveSubscription } from "@/lib/subscription";
import { getPublicCaseStudies } from "@/lib/calibration/service";
import { getIngestLatencyStats, getSpeedWins } from "@/lib/speed-wins";
import { getCachedFeed } from "@/lib/feed-cache";
import { SUBSCRIPTION_PRICE, SUBSCRIPTION_PRICE_LABEL } from "@/lib/stripe";

export const metadata: Metadata = {
  title: "TrustTicker — Know why it’s moving before you chase it",
  description:
    "TrustTicker verifies US stock catalysts, flags dilution and low-quality news, and sends watchlist alerts with float and relative-volume context. Informational only — not investment advice.",
};

export default async function HomePage() {
  const session = await auth();
  const displayName = session?.user
    ? session.user.name || session.user.email?.split("@")[0] || "Trader"
    : undefined;

  let isSubscribed = false;
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { subscriptionStatus: true, subscriptionEndsAt: true },
    });
    isSubscribed = hasActiveSubscription(user ?? undefined);
  }

  const [cases, latency, wins, feed] = await Promise.all([
    getPublicCaseStudies(1).catch(() => []),
    getIngestLatencyStats(24).catch(() => ({
      avgSec: null,
      under3mRate: null,
      sampleSize: 0,
      fastestSec: null,
    })),
    getSpeedWins(5, 72, "fastest").catch(() => []),
    getCachedFeed("all").catch(() => ({ items: [], meta: null })),
  ]);

  const caseStudy = cases[0] ?? null;
  const landingLatency = {
    avgSec: latency.avgSec,
    under3mRate: latency.under3mRate ?? null,
    sampleSize: latency.sampleSize,
    feedCount: feed.items?.length ?? 0,
    fastestSec: latency.fastestSec ?? null,
  };

  const recentWins = wins.map((w) => ({
    id: w.id,
    symbol: w.symbol,
    headline: w.headline,
    publishedAt: w.publishedAt,
    ingestedAt: w.ingestedAt,
    ingestDelaySec: w.ingestDelaySec,
    changePercent: w.changePercent,
  }));

  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://trustticker.app";

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "TrustTicker",
        url: siteUrl,
        logo: `${siteUrl}/icon-512.png`,
        description:
          "Verifies US stock catalysts, flags dilution and low-quality news, and sends watchlist alerts with float and relative-volume context.",
      },
      {
        "@type": "SoftwareApplication",
        name: "TrustTicker",
        applicationCategory: "FinanceApplication",
        operatingSystem: "Web",
        url: siteUrl,
        description:
          "TrustTicker verifies US stock catalysts, flags dilution and low-quality news, and sends watchlist alerts with float and relative-volume context.",
        offers: {
          "@type": "Offer",
          price: String(SUBSCRIPTION_PRICE),
          priceCurrency: "USD",
          description: `${SUBSCRIPTION_PRICE_LABEL}/month after trial. Cancel anytime.`,
        },
      },
      {
        "@type": "FAQPage",
        mainEntity: LANDING_FAQ_FOR_SCHEMA.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.a,
          },
        })),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <FunnelViewBeacon event="landing_view" />
      <Navbar />
      <MarketingLanding
        displayName={displayName}
        isSubscribed={isSubscribed}
        caseStudy={caseStudy}
        latency={landingLatency}
        recentWins={recentWins}
      />
    </>
  );
}
