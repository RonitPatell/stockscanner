"use client";

import { useEffect } from "react";
import type { FunnelEvent } from "@/lib/analytics/track";

/** Fire a privacy-safe funnel page view once on mount. */
export function FunnelViewBeacon({ event }: { event: FunnelEvent }) {
  useEffect(() => {
    void fetch("/api/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event }),
    }).catch(() => {});
  }, [event]);
  return null;
}
