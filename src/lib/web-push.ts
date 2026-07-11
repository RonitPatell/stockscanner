import webpush from "web-push";
import type { CatalystItem } from "@/types";

export interface PushSubscriptionJson {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

function configureVapid(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:support@trustticker.app";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export function getVapidPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;
}

export async function sendPushNotification(
  subscription: PushSubscriptionJson,
  payload: { title: string; body: string; url?: string; symbol?: string }
): Promise<boolean> {
  if (!configureVapid()) return false;
  try {
    await webpush.sendNotification(
      subscription as unknown as Parameters<typeof webpush.sendNotification>[0],
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        url: payload.url || "/dashboard",
        symbol: payload.symbol,
      })
    );
    return true;
  } catch {
    return false;
  }
}

export async function sendPushAlert(
  subscription: PushSubscriptionJson,
  catalyst: CatalystItem,
  ruleName?: string
): Promise<boolean> {
  const move =
    catalyst.changePercent != null
      ? `${catalyst.changePercent >= 0 ? "+" : ""}${catalyst.changePercent.toFixed(1)}%`
      : "";
  return sendPushNotification(subscription, {
    title: `${catalyst.symbol} ${move}`.trim(),
    body: `[${ruleName || "Alert"}] ${catalyst.headline.slice(0, 120)}`,
    url: `/ticker/${encodeURIComponent(catalyst.symbol)}`,
    symbol: catalyst.symbol,
  });
}
