import { prisma } from "./prisma";
import { sendDiscordWebhook } from "./alerts";
import type { CatalystItem } from "@/types";

const recentAlerts = new Map<string, number>();
const ALERT_COOLDOWN_MS = 15 * 60 * 1000;

function canAlert(userId: string, symbol: string): boolean {
  const key = `${userId}:${symbol}`;
  const last = recentAlerts.get(key) ?? 0;
  if (Date.now() - last < ALERT_COOLDOWN_MS) return false;
  recentAlerts.set(key, Date.now());
  return true;
}

export async function dispatchWatchlistAlerts(catalysts: CatalystItem[]): Promise<number> {
  if (catalysts.length === 0) return 0;

  const users = await prisma.user.findMany({
    where: {
      OR: [{ subscriptionStatus: "active" }, { subscriptionStatus: "trialing" }],
      watchlist: { isEmpty: false },
    },
    select: {
      id: true,
      watchlist: true,
      discordWebhook: true,
      discordAlertsEnabled: true,
      smsAlertsEnabled: true,
      phoneNumber: true,
    },
  });

  if (users.length === 0) return 0;

  let sent = 0;

  for (const user of users) {
    const watchSet = new Set(user.watchlist.map((s) => s.toUpperCase()));
    const hits = catalysts.filter((c) => watchSet.has(c.symbol.toUpperCase()));

    for (const catalyst of hits) {
      if (!canAlert(user.id, catalyst.symbol)) continue;

      if (user.discordAlertsEnabled && user.discordWebhook) {
        const ok = await sendDiscordWebhook(user.discordWebhook, {
          symbol: catalyst.symbol,
          headline: `[Watchlist] ${catalyst.headline}`,
          summary: catalyst.aiSummary,
          sentimentScore: catalyst.sentimentScore,
          sentimentLabel: catalyst.sentimentLabel,
          price: catalyst.price,
          changePercent: catalyst.changePercent,
        });
        if (ok) sent++;
      }

      if (user.smsAlertsEnabled && user.phoneNumber && process.env.TWILIO_ACCOUNT_SID) {
        try {
          const { sendSmsAlert } = await import("./sms-alerts");
          const ok = await sendSmsAlert(user.phoneNumber, catalyst);
          if (ok) sent++;
        } catch { /* optional */ }
      }
    }
  }

  return sent;
}
