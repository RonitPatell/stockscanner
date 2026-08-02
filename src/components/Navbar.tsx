"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "./ui/button";
import { UserMenu } from "./UserMenu";
import { BrandHomeLink } from "./BrandHomeLink";

import { isSubscribedFromSettings } from "@/lib/subscription-client";
import { entitledDashboardHref } from "@/lib/monitor/route";
import { isMonitorV1Enabled } from "@/lib/monitor";

export function Navbar() {
  const { data: session, status } = useSession();
  const isLoggedIn = status === "authenticated" && !!session?.user;
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) {
      setIsSubscribed(false);
      return;
    }
    let cancelled = false;
    void fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) {
          setIsSubscribed(isSubscribedFromSettings(data));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, session?.user?.id]);

  const scannerHref = isSubscribed ? entitledDashboardHref() : "/demo";
  const scannerLabel = isSubscribed ? "Open Scanner" : "Evidence demo";
  /** Link prefetch only when entitled — Next skips work for demo. */
  const monitorLinkPrefetch = isSubscribed && isMonitorV1Enabled();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-[var(--border)] bg-[rgba(9,8,7,0.72)] backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <BrandHomeLink
          className="group transition-transform duration-200 active:scale-[0.98]"
          iconClassName="w-8 h-8 group-hover:shadow-emerald-500/50"
          textClassName="text-lg"
        />

        <nav className="hidden md:flex items-center gap-8 text-sm text-[var(--text-secondary)]">
          {!isLoggedIn && (
            <>
              <Link href="/#benefits" className="hover:text-[var(--text-primary)] transition-colors">Benefits</Link>
              <Link href="/demo" className="hover:text-[var(--text-primary)] transition-colors">Demo</Link>
              <Link href="/case-studies" className="hover:text-[var(--text-primary)] transition-colors">Cases</Link>
              <Link href="/wins" className="hover:text-[var(--text-primary)] transition-colors">Speed wins</Link>
              <Link href="/#pricing" className="hover:text-[var(--text-primary)] transition-colors">Pricing</Link>
            </>
          )}
          {isLoggedIn && (
            <>
              <Link href="/#benefits" className="hover:text-[var(--text-primary)] transition-colors">Benefits</Link>
              {!isSubscribed && (
                <Link href="/demo" className="hover:text-[var(--text-primary)] transition-colors">Demo</Link>
              )}
              {isSubscribed && (
                <>
                  <Link
                    href={scannerHref}
                    prefetch={monitorLinkPrefetch}
                    className="hover:text-[var(--text-primary)] transition-colors"
                  >
                    Scanner
                  </Link>
                  <Link href="/desk" className="hover:text-[var(--text-primary)] transition-colors">Prop Desk</Link>
                </>
              )}
            </>
          )}
          <Link href="/legal/disclaimer" className="hover:text-[var(--text-primary)] transition-colors">Disclaimer</Link>
          <Link href="/legal/privacy" className="hover:text-[var(--text-primary)] transition-colors hidden lg:inline">Privacy</Link>
          <Link href="/legal/cookies" className="hover:text-[var(--text-primary)] transition-colors hidden lg:inline">Cookies</Link>
        </nav>

        <div className="flex items-center gap-3">
          {isLoggedIn ? (
            <>
              <Link
                href={scannerHref}
                prefetch={isSubscribed ? monitorLinkPrefetch : true}
                className="hidden sm:block"
              >
                <Button size="sm">{scannerLabel}</Button>
              </Link>
              <UserMenu />
            </>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm">Log in</Button>
              </Link>
              <Link href="/pricing">
                <Button size="sm">Start Free Trial</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
