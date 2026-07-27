import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Providers } from "@/components/Providers";
import { CookieNotice } from "@/components/CookieNotice";
import "./globals.css";

/**
 * Clean fintech stack:
 * - Inter — neutral grotesk used across Brex / high-converting SaaS
 * - JetBrains Mono — tabular market data only
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "TrustTicker — Stock Catalyst Scanner",
  description:
    "Catalyst command center with measured ingest latency, action playbooks, dilution radar, and prop desk tools. Informational only — not investment advice.",
  keywords: [
    "stock scanner",
    "catalyst",
    "day trading",
    "premarket movers",
    "dilution radar",
    "news trading",
  ],
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-icon.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased dark`}
      suppressHydrationWarning
    >
      <body
        className="min-h-full flex flex-col bg-[var(--bg)] text-[var(--text-primary)]"
        suppressHydrationWarning
      >
        <Providers>{children}</Providers>
        <CookieNotice />
        <Analytics />
      </body>
    </html>
  );
}
