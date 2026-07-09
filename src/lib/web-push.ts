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

export async function sendPushAlert(
  subscription: PushSubscriptionJson,
  catalyst: CatalystItem,
  ruleName?: string
): Promise<boolean> {
  if (!configureVapid()) return false;

  const move =
    catalyst.changePercent != null
      ? `${catalyst.changePercent >= 0 ? "+" : ""}${catalyst.changePercent.toFixed(1)}%`
      : "";
  const payload = JSON.stringify({
    title: `${catalyst.symbol} ${move}`.trim(),
    body: `[${ruleName || "Alert"}] ${catalyst.headline.slice(0, 120)}`,
    url: "/dashboard",
    symbol: catalyst.symbol,
  });

  try {
    await webpush.sendNotification(subscription as unknown as Parameters<typeof webpush.sendNotification>[0], payload);
    return true;
  } catch {
    return false;
  }
}
