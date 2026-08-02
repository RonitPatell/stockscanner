"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { monitorRouteHref } from "@/lib/monitor/route";
import {
  prefetchMonitorRoute,
  warmMonitorCriticalAssets,
} from "@/lib/monitor/prefetch";
import { isSubscribedFromSettings } from "@/lib/subscription-client";

export function SubscriptionActivating() {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh();
    }, 2000);

    const timeout = setTimeout(() => clearInterval(interval), 30000);

    // When entitlement flips on, prefetch Monitor before the next full paint.
    const entitlementPoll = setInterval(() => {
      void fetch("/api/settings")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!isSubscribedFromSettings(data)) return;
          const access = { subscribed: true };
          void prefetchMonitorRoute(router, access);
          void warmMonitorCriticalAssets(access);
          clearInterval(entitlementPoll);
          // Prefer Monitor destination once Pro is live.
          if (
            typeof window !== "undefined" &&
            !window.location.search.includes("view=")
          ) {
            router.replace(monitorRouteHref({ subscribed: "true" }));
          }
        })
        .catch(() => {});
    }, 2_500);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
      clearInterval(entitlementPoll);
    };
  }, [router]);

  return (
    <div className="mb-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 flex items-center gap-2">
      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
      Payment received — activating your subscription...
    </div>
  );
}
