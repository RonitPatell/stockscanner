"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  canPrefetchMonitor,
  prefetchMonitorRoute,
  warmMonitorCriticalAssets,
  type MonitorPrefetchAccess,
} from "@/lib/monitor/prefetch";

/**
 * After auth + entitlement: prefetch Monitor route and warm critical JS once.
 * Does not poll the snapshot API.
 */
export function MonitorRouteWarmer({
  access,
  /** Also warm JS chunks (post-login / checkout). Hover uses route-only. */
  warmAssets = true,
}: {
  access: MonitorPrefetchAccess;
  warmAssets?: boolean;
}) {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    if (!canPrefetchMonitor(access)) return;
    ran.current = true;
    void prefetchMonitorRoute(router, access);
    if (warmAssets) {
      void warmMonitorCriticalAssets(access);
    }
  }, [access, router, warmAssets]);

  return null;
}
