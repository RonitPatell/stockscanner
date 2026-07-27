/**
 * In-tab Notification API with actionable buttons where supported.
 */
import { detectNotificationActions } from "./browser-support.ts";
import type { CatalystItem } from "@/types";

export function showFocusCatalystNotification(
  c: CatalystItem,
  opts?: { requireInteraction?: boolean }
): boolean {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return false;
  }
  if (Notification.permission !== "granted") return false;

  const actionsSupport = detectNotificationActions(window);
  const title = `${c.symbol} catalyst`;
  const body = [
    c.catalystType?.replace(/_/g, " "),
    c.changePercent != null
      ? `${c.changePercent >= 0 ? "+" : ""}${c.changePercent.toFixed(1)}%`
      : null,
    c.rVol != null ? `RVol ${c.rVol.toFixed(1)}` : null,
  ]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 120);

  try {
    const optsBase: NotificationOptions = {
      body,
      icon: "/icon-192.png",
      tag: `tt-focus-${c.id}`,
      data: { symbol: c.symbol, catalystId: c.id, url: "/dashboard?focus=1" },
      requireInteraction: opts?.requireInteraction ?? false,
    };
    // actions only when supported (often SW-only; still attempt)
    const n = new Notification(title, {
      ...optsBase,
      ...(actionsSupport.supported
        ? {
            actions: [
              { action: "open", title: "Open" },
              { action: "mute", title: "Mute" },
              { action: "watchlist", title: "Watchlist" },
              { action: "evidence", title: "Evidence" },
            ],
          }
        : {}),
    } as NotificationOptions);
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}

export async function ensureNotificationPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return "unsupported";
  }
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return "unsupported";
  }
}
