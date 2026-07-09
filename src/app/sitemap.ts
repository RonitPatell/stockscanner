import type { MetadataRoute } from "next";

const POPULAR_TICKERS = [
  "NVDA", "AMD", "TSLA", "AAPL", "MSFT", "META", "GOOGL", "AMZN",
  "MRNA", "SOFI", "PLTR", "COIN", "RIVN", "GME", "AMC", "MARA",
];

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://trustticker.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/pricing`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/demo`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/wins`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.85 },
    { url: `${BASE}/login`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
  ];

  const tickerPages: MetadataRoute.Sitemap = POPULAR_TICKERS.map((sym) => ({
    url: `${BASE}/ticker/${sym}`,
    lastModified: new Date(),
    changeFrequency: "hourly" as const,
    priority: 0.7,
  }));

  return [...staticPages, ...tickerPages];
}
