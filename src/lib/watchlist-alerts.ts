import { prisma } from "./prisma";
import { sendDiscordWebhook } from "./alerts";
import {
  normalizeAlertRules,
  pickMatchingRules,
  type AlertRule,
} from "./alert-rules";
import type { CatalystItem } from "@/types";

const recentAlerts = new Map<string, number>();
const MAX_ALERT_AGE_MS = 2 * 60 * 60 * 1000;

function canAlertMemory(userId: string, symbol: string, ruleId: string, cooldownMs: number): boolean {
  const key = `${userId}:${symbol}:${ruleId}`;
  const last = recentAlerts.get(key) ?? 0;
  if (Date.now() - last < cooldownMs) return false;
  recentAlerts.set(key, Date.now());
  return true;
}

function isFreshCatalyst(c: CatalystItem): boolean {
  const ageMs = Date.now() - new Date(c.publishedAt).getTime();
  return ageMs <= MAX_ALERT_AGE_MS;
}

async function canAlertDb(
  userId: string,
  symbol: string,
  channel: string,
  cooldownMs: number
): Promise<boolean> {
  const since = new Date(Date.now() - cooldownMs);
  const recent = await prisma.alertLog.findFirst({
    where: {
      userId,
      channel,
      createdAt: { gte: since },
      catalyst: { symbol },
      status: "sent",
    },
    select: { id: true },
  });
  return !recent;
}

function hodSymbolsFromCatalysts(catalysts: CatalystItem[]): Set<string> {
  const out = new Set<string>();
  for (const c of catalysts) {
    const move = Math.abs(c.changePercent ?? 0);
    if (move >= 4 || (c.setupTags?.includes("hod_break") ?? false)) {
      out.add(c.symbol.toUpperCase());
    }
  }
  return out;
}

async function dispatchForRule(
  user: {
    id: string;
    discordWebhook: string | null;
    discordAlertsEnabled: boolean;
    smsAlertsEnabled: boolean;
    phoneNumber: string | null;
  },
  catalyst: CatalystItem,
  rule: AlertRule
): Promise<number> {
  const cooldownMs = (rule.cooldownMinutes ?? 15) * 60 * 1000;
  if (!canAlertMemory(user.id, catalyst.symbol, rule.id, cooldownMs)) return 0;

  let sent = 0;
  const channels = rule.channels.length ? rule.channels : ["discord"];

  if (channels.includes("discord") && user.discordAlertsEnabled && user.discordWebhook) {
    const okCooldown = await canAlertDb(user.id, catalyst.symbol, "discord", cooldownMs);
    if (okCooldown) {
      const ok = await sendDiscordWebhook(user.discordWebhook, {
        symbol: catalyst.symbol,
        headline: `[${rule.name}] ${catalyst.headline}`,
        summary: catalyst.aiSummary,
        sentimentScore: catalyst.sentimentScore,
        sentimentLabel: catalyst.sentimentLabel,
        price: catalyst.price,
        changePercent: catalyst.changePercent,
      });
      await prisma.alertLog
        .create({
          data: {
            userId: user.id,
            catalystId: catalyst.id,
            channel: "discord",
            status: ok ? "sent" : "failed",
          },
        })
        .catch(() => {});
      if (ok) sent++;
    }
  }

  if (
    channels.includes("sms") &&
    user.smsAlertsEnabled &&
    user.phoneNumber &&
    process.env.TWILIO_ACCOUNT_SID
  ) {
    const okCooldown = await canAlertDb(user.id, catalyst.symbol, "sms", cooldownMs);
    if (okCooldown) {
      try {
        const { sendSmsAlert } = await import("./sms-alerts");
        const ok = await sendSmsAlert(user.phoneNumber, catalyst);
        await prisma.alertLog
          .create({
            data: {
              userId: user.id,
              catalystId: catalyst.id,
              channel: "sms",
              status: ok ? "sent" : "failed",
            },
          })
          .catch(() => {});
        if (ok) sent++;
      } catch {
        await prisma.alertLog
          .create({
            data: {
              userId: user.id,
              catalystId: catalyst.id,
              channel: "sms",
              status: "failed",
            },
          })
          .catch(() => {});
      }
    }
  }

  return sent;
}

export async function dispatchWatchlistAlerts(catalysts: CatalystItem[]): Promise<number> {
  if (catalysts.length === 0) return 0;

  const fresh = catalysts.filter(isFreshCatalyst);
  if (fresh.length === 0) return 0;

  const users = await prisma.user.findMany({
    where: {
      OR: [{ subscriptionStatus: "active" }, { subscriptionStatus: "trialing" }],
      watchlist: { isEmpty: false },
    },
    select: {
      id: true,
      watchlist: true,
      alertRules: true,
      discordWebhook: true,
      discordAlertsEnabled: true,
      smsAlertsEnabled: true,
      phoneNumber: true,
    },
  });

  if (users.length === 0) return 0;

  const hodSymbols = hodSymbolsFromCatalysts(fresh);
  let sent = 0;

  for (const user of users) {
    const watchSet = new Set(user.watchlist.map((s) => s.toUpperCase()));
    const rules = normalizeAlertRules(user.alertRules);
    const ctx = {
      watchlist: watchSet,
      hodSymbols,
      vwapAboveSymbols: hodSymbols,
    };

    const candidates =
      rules.some((r) => r.scope === "any")
        ? fresh
        : fresh.filter((c) => watchSet.has(c.symbol.toUpperCase()));

    for (const catalyst of candidates) {
      const matching = pickMatchingRules(catalyst, rules, ctx);
      for (const rule of matching) {
        sent += await dispatchForRule(user, catalyst, rule);
      }
    }
  }

  return sent;
}
