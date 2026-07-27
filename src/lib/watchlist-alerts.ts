import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { sendDiscordWebhook } from "./alerts";
import {
  normalizeAlertRules,
  pickMatchingRules,
  type AlertRule,
} from "./alert-rules";
import { evaluateAlertMode } from "./alerts/modes";
import type { CatalystItem } from "@/types";
import { getRedis } from "./redis";
import type { AlertMode } from "./coverage/types";

const recentAlerts = new Map<string, number>();
const MAX_ALERT_AGE_MS = 2 * 60 * 60 * 1000;

function canAlertMemory(userId: string, symbol: string, ruleId: string, cooldownMs: number): boolean {
  const key = `${userId}:${symbol}:${ruleId}`;
  const last = recentAlerts.get(key) ?? 0;
  if (Date.now() - last < cooldownMs) return false;
  recentAlerts.set(key, Date.now());
  return true;
}

/**
 * Cross-process / restart-safe claim so duplicate workers don't double-send.
 * Keyed by catalyst + user + channel.
 */
async function claimAlertAttempt(
  userId: string,
  catalystId: string,
  channel: string,
  cooldownMs: number
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true;
  try {
    const key = `alert:claim:${userId}:${catalystId}:${channel}`;
    const ok = await redis.set(key, "1", { nx: true, px: Math.max(cooldownMs, 60_000) });
    return Boolean(ok);
  } catch {
    return true;
  }
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

import type { PushSubscriptionJson } from "./web-push";

async function dispatchForRule(
  user: {
    id: string;
    email: string;
    discordWebhook: string | null;
    discordAlertsEnabled: boolean;
    smsAlertsEnabled: boolean;
    emailAlertsEnabled: boolean;
    phoneNumber: string | null;
    pushSubscription: unknown;
  },
  catalyst: CatalystItem,
  rule: AlertRule,
  alertMode?: AlertMode | string | null,
  modeEval?: {
    triggered: { id: string; label: string; passed: boolean; detail?: string }[];
    blocked: { id: string; label: string; passed: boolean; detail?: string }[];
  } | null
): Promise<number> {
  const cooldownMs = (rule.cooldownMinutes ?? 15) * 60 * 1000;
  if (!canAlertMemory(user.id, catalyst.symbol, rule.id, cooldownMs)) {
    await logAlertOutcome({
      userId: user.id,
      catalystId: catalyst.id,
      channel: "eval",
      status: "cooldown",
      alertMode: alertMode ?? rule.mode ?? null,
      ruleId: rule.id,
      triggered: modeEval?.triggered ?? [],
      blocked: [
        ...(modeEval?.blocked ?? []),
        { id: "cooldown", label: "Per-user cooldown active", passed: false },
      ],
    });
    return 0;
  }

  let sent = 0;
  const channels = rule.channels.length ? rule.channels : ["discord"];
  const meta = {
    alertMode: alertMode ?? rule.mode ?? null,
    ruleId: rule.id,
    triggered: modeEval?.triggered ?? [{ id: "legacy_rule", label: rule.name, passed: true }],
    blocked: modeEval?.blocked ?? [],
  };

  const { isAlertBackboneV2Enabled } = await import("./alert-backbone/flags");
  if (isAlertBackboneV2Enabled()) {
    const { dispatchChannelsIsolated } = await import(
      "./alert-backbone/channel-dispatch"
    );
    const { buildAlertEventId, mapSourceToQueue } = await import(
      "./alert-backbone/events"
    );
    const eventId = buildAlertEventId({
      providerItemId: catalyst.id,
      url: catalyst.sourceUrl,
      title: catalyst.headline,
      ticker: catalyst.symbol,
      publishedAt: new Date(catalyst.publishedAt),
    });
    const queue = mapSourceToQueue({
      source: catalyst.source,
      sourceTier: catalyst.sourceTier,
      isSec: catalyst.source === "SEC EDGAR",
    });

    type Job = import("./alert-backbone/channel-dispatch").IsolatedChannelJob;
    const jobs: Job[] = [];

    // In-app / browser first (feed already published; acknowledge delivery intent)
    jobs.push({
      channel: "in_app",
      userId: user.id,
      eventId,
      eventVersion: 1,
      catalystId: catalyst.id,
      queue,
      publishedAt: catalyst.publishedAt,
      priority: "immediate",
      cooldownMs,
      send: async () => true,
    });

    if (channels.includes("discord") && user.discordAlertsEnabled && user.discordWebhook) {
      const webhook = user.discordWebhook;
      jobs.push({
        channel: "discord",
        userId: user.id,
        eventId,
        eventVersion: 1,
        catalystId: catalyst.id,
        queue,
        publishedAt: catalyst.publishedAt,
        priority: "async",
        cooldownMs,
        send: async () => {
          const okCooldown = await canAlertDb(user.id, catalyst.symbol, "discord", cooldownMs);
          if (!okCooldown) return false;
          const ok = await sendDiscordWebhook(webhook, {
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
                alertMode: meta.alertMode,
                ruleId: meta.ruleId,
                triggeredConditions: meta.triggered as unknown as Prisma.InputJsonValue,
                blockedConditions: meta.blocked as unknown as Prisma.InputJsonValue,
              },
            })
            .catch(() => {});
          return ok;
        },
      });
    }

    if (
      channels.includes("sms") &&
      user.smsAlertsEnabled &&
      user.phoneNumber &&
      process.env.TWILIO_ACCOUNT_SID
    ) {
      const phone = user.phoneNumber;
      jobs.push({
        channel: "sms",
        userId: user.id,
        eventId,
        eventVersion: 1,
        catalystId: catalyst.id,
        queue,
        publishedAt: catalyst.publishedAt,
        priority: "async",
        cooldownMs,
        send: async () => {
          const okCooldown = await canAlertDb(user.id, catalyst.symbol, "sms", cooldownMs);
          if (!okCooldown) return false;
          const { sendSmsAlert } = await import("./sms-alerts");
          const ok = await sendSmsAlert(phone, catalyst);
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
          return ok;
        },
      });
    }

    if (channels.includes("email") && user.emailAlertsEnabled && user.email) {
      const email = user.email;
      jobs.push({
        channel: "email",
        userId: user.id,
        eventId,
        eventVersion: 1,
        catalystId: catalyst.id,
        queue,
        publishedAt: catalyst.publishedAt,
        priority: "async",
        cooldownMs,
        send: async () => {
          const okCooldown = await canAlertDb(user.id, catalyst.symbol, "email", cooldownMs);
          if (!okCooldown) return false;
          const { sendEmailAlert } = await import("./email-alerts");
          const ok = await sendEmailAlert(email, catalyst, rule.name);
          await prisma.alertLog
            .create({
              data: {
                userId: user.id,
                catalystId: catalyst.id,
                channel: "email",
                status: ok ? "sent" : "failed",
              },
            })
            .catch(() => {});
          return ok;
        },
      });
    }

    if (channels.includes("push") && user.pushSubscription) {
      const sub = user.pushSubscription as PushSubscriptionJson;
      jobs.push({
        channel: "push",
        userId: user.id,
        eventId,
        eventVersion: 1,
        catalystId: catalyst.id,
        queue,
        publishedAt: catalyst.publishedAt,
        priority: "async",
        cooldownMs,
        send: async () => {
          const okCooldown = await canAlertDb(user.id, catalyst.symbol, "push", cooldownMs);
          if (!okCooldown) return false;
          const { sendPushAlert } = await import("./web-push");
          const ok = await sendPushAlert(sub, catalyst, rule.name);
          await prisma.alertLog
            .create({
              data: {
                userId: user.id,
                catalystId: catalyst.id,
                channel: "push",
                status: ok ? "sent" : "failed",
              },
            })
            .catch(() => {});
          return ok;
        },
      });
    }

    const results = await dispatchChannelsIsolated(jobs);
    sent = results.filter((r) => r.status === "delivered" && r.channel !== "in_app").length;

    if (sent > 0) {
      try {
        const prior = await prisma.alertLog.count({
          where: { userId: user.id, status: "sent" },
        });
        if (prior <= sent) {
          const { track } = await import("./analytics/track");
          void track("first_alert_delivered", { kind: "live" });
        }
      } catch {
        /* ignore */
      }
    }
    return sent;
  }

  if (channels.includes("discord") && user.discordAlertsEnabled && user.discordWebhook) {
    const okCooldown = await canAlertDb(user.id, catalyst.symbol, "discord", cooldownMs);
    const claimed = okCooldown
      ? await claimAlertAttempt(user.id, catalyst.id, "discord", cooldownMs)
      : false;
    if (okCooldown && claimed) {
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
            alertMode: meta.alertMode,
            ruleId: meta.ruleId,
            triggeredConditions: meta.triggered as unknown as Prisma.InputJsonValue,
            blockedConditions: meta.blocked as unknown as Prisma.InputJsonValue,
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
    const claimed = okCooldown
      ? await claimAlertAttempt(user.id, catalyst.id, "sms", cooldownMs)
      : false;
    if (okCooldown && claimed) {
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

  if (channels.includes("email") && user.emailAlertsEnabled && user.email) {
    const okCooldown = await canAlertDb(user.id, catalyst.symbol, "email", cooldownMs);
    const claimed = okCooldown
      ? await claimAlertAttempt(user.id, catalyst.id, "email", cooldownMs)
      : false;
    if (okCooldown && claimed) {
      try {
        const { sendEmailAlert } = await import("./email-alerts");
        const ok = await sendEmailAlert(user.email, catalyst, rule.name);
        await prisma.alertLog
          .create({
            data: {
              userId: user.id,
              catalystId: catalyst.id,
              channel: "email",
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
              channel: "email",
              status: "failed",
            },
          })
          .catch(() => {});
      }
    }
  }

  if (channels.includes("push") && user.pushSubscription) {
    const okCooldown = await canAlertDb(user.id, catalyst.symbol, "push", cooldownMs);
    const claimed = okCooldown
      ? await claimAlertAttempt(user.id, catalyst.id, "push", cooldownMs)
      : false;
    if (okCooldown && claimed) {
      try {
        const { sendPushAlert } = await import("./web-push");
        const sub = user.pushSubscription as PushSubscriptionJson;
        const ok = await sendPushAlert(sub, catalyst, rule.name);
        await prisma.alertLog
          .create({
            data: {
              userId: user.id,
              catalystId: catalyst.id,
              channel: "push",
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
              channel: "push",
              status: "failed",
            },
          })
          .catch(() => {});
      }
    }
  }

  if (sent > 0) {
    try {
      const prior = await prisma.alertLog.count({
        where: { userId: user.id, status: "sent" },
      });
      // count includes rows just written in this dispatch — first ever means prior === sent
      if (prior <= sent) {
        const { track } = await import("./analytics/track");
        void track("first_alert_delivered", { kind: "live" });
      }
    } catch {
      /* ignore */
    }
  }

  return sent;
}

export async function dispatchWatchlistAlerts(catalysts: CatalystItem[]): Promise<number> {
  if (catalysts.length === 0) return 0;

  const fresh = catalysts.filter(
    (c) => isFreshCatalyst(c) && !c.quarantined
  );
  if (fresh.length === 0) return 0;

  const users = await prisma.user.findMany({
    where: {
      OR: [{ subscriptionStatus: "active" }, { subscriptionStatus: "trialing" }],
      watchlist: { isEmpty: false },
    },
    select: {
      id: true,
      email: true,
      watchlist: true,
      alertRules: true,
      alertStrategies: true,
      discordWebhook: true,
      discordAlertsEnabled: true,
      smsAlertsEnabled: true,
      emailAlertsEnabled: true,
      phoneNumber: true,
      pushSubscription: true,
    },
  });

  if (users.length === 0) return 0;

  const hodSymbols = hodSymbolsFromCatalysts(fresh);
  const abovePriorCloseSymbols = new Set(
    fresh
      .filter((c) => (c.changePercent ?? 0) > 0)
      .map((c) => c.symbol.toUpperCase())
  );
  let sent = 0;

  const {
    normalizeAlertStrategies,
    evaluateStrategy,
    factsFromCatalyst,
    marketSessionAt,
    checkStrategyCooldown,
    recordStrategyFire,
    detectRiskDilutionFlags,
  } = await import("./alert-strategy/dispatch-helpers");

  for (const user of users) {
    const watchSet = new Set(user.watchlist.map((s) => s.toUpperCase()));
    const strategies = normalizeAlertStrategies(user.alertStrategies).filter(
      (s) => s.enabled
    );

    // Prefer Strategy Builder when the user has saved strategies; else legacy rules.
    if (strategies.length > 0) {
      for (const catalyst of fresh) {
        const onWatchlist = watchSet.has(catalyst.symbol.toUpperCase());
        const dilutionFlags = detectRiskDilutionFlags(catalyst);
        const facts = factsFromCatalyst(catalyst, {
          onWatchlist,
          marketSession: marketSessionAt(new Date(catalyst.publishedAt)),
          dilutionFlags,
        });

        for (const strategy of strategies) {
          const evalResult = evaluateStrategy(strategy, facts, catalyst);
          if (!evalResult.matched) {
            await logAlertOutcome({
              userId: user.id,
              catalystId: catalyst.id,
              channel: "eval",
              status: "blocked",
              alertMode: strategy.delivery,
              ruleId: strategy.id,
              triggered: evalResult.details
                .filter((d) => d.passed)
                .map((d) => ({
                  id: d.conditionId,
                  label: d.field,
                  passed: true,
                  detail: d.detail,
                })),
              blocked: evalResult.details
                .filter((d) => !d.passed)
                .map((d) => ({
                  id: d.conditionId,
                  label: d.field,
                  passed: false,
                  detail: d.detail,
                })),
            });
            continue;
          }

          const cd = checkStrategyCooldown({
            userId: user.id,
            strategyId: strategy.id,
            symbol: catalyst.symbol,
            cooldownMinutes: strategy.cooldownMinutes,
            dailyAlertCap: strategy.dailyAlertCap,
          });
          if (!cd.allowed) {
            await logAlertOutcome({
              userId: user.id,
              catalystId: catalyst.id,
              channel: "eval",
              status: "cooldown",
              alertMode: strategy.delivery,
              ruleId: strategy.id,
              triggered: [],
              blocked: [
                {
                  id: "strategy_cooldown",
                  label: cd.reason ?? "Cooldown",
                  passed: false,
                },
              ],
            });
            continue;
          }

          const asRule: AlertRule = {
            id: strategy.id,
            enabled: true,
            name: strategy.name,
            scope: "any",
            channels: strategy.channels,
            mode: strategy.delivery,
            cooldownMinutes: strategy.cooldownMinutes,
          };
          const n = await dispatchForRule(
            user,
            catalyst,
            asRule,
            strategy.delivery,
            {
              triggered: evalResult.details
                .filter((d) => d.passed)
                .map((d) => ({
                  id: d.conditionId,
                  label: d.field,
                  passed: true,
                  detail: d.detail,
                })),
              blocked: evalResult.details
                .filter((d) => !d.passed)
                .map((d) => ({
                  id: d.conditionId,
                  label: d.field,
                  passed: false,
                  detail: d.detail,
                })),
            }
          );
          if (n > 0) {
            recordStrategyFire({
              userId: user.id,
              strategyId: strategy.id,
              symbol: catalyst.symbol,
            });
            sent += n;
          }
        }
      }
      continue;
    }

    const rules = normalizeAlertRules(user.alertRules);
    const ctx = {
      watchlist: watchSet,
      hodSymbols,
      abovePriorCloseSymbols,
    };

    const candidates =
      rules.some((r) => r.scope === "any")
        ? fresh
        : fresh.filter((c) => watchSet.has(c.symbol.toUpperCase()));

    for (const catalyst of candidates) {
      const matching = pickMatchingRules(catalyst, rules, ctx);
      const considered = rules.filter((r) => r.enabled);

      for (const rule of considered) {
        const inScope =
          rule.scope === "any" || watchSet.has(catalyst.symbol.toUpperCase());
        if (!inScope) continue;

        const modeEval = rule.mode
          ? evaluateAlertMode(rule.mode, catalyst, {
              changePercent: catalyst.changePercent,
              rVol: catalyst.rVol,
              minConfirmedChange: rule.minChangePercent,
              minConfirmedRvol: rule.minRvol,
            })
          : null;

        const fires = matching.some((m) => m.id === rule.id);
        if (!fires) {
          if (rule.mode) {
            await logAlertOutcome({
              userId: user.id,
              catalystId: catalyst.id,
              channel: "eval",
              status: "blocked",
              alertMode: rule.mode,
              ruleId: rule.id,
              triggered: modeEval?.triggered ?? [],
              blocked: modeEval?.blocked ?? [],
            });
          }
          continue;
        }

        sent += await dispatchForRule(
          user,
          catalyst,
          rule,
          modeEval?.mode ?? rule.mode,
          modeEval
        );
      }
    }
  }

  return sent;
}

async function logAlertOutcome(opts: {
  userId: string;
  catalystId: string;
  channel: string;
  status: string;
  alertMode?: string | null;
  ruleId?: string | null;
  triggered: { id: string; label: string; passed: boolean; detail?: string }[];
  blocked: { id: string; label: string; passed: boolean; detail?: string }[];
}): Promise<void> {
  // eval channel is for condition audit only — unique key includes channel
  await prisma.alertLog
    .upsert({
      where: {
        userId_catalystId_channel: {
          userId: opts.userId,
          catalystId: opts.catalystId,
          channel: opts.channel,
        },
      },
      create: {
        userId: opts.userId,
        catalystId: opts.catalystId,
        channel: opts.channel,
        status: opts.status,
        alertMode: opts.alertMode ?? null,
        ruleId: opts.ruleId ?? null,
        triggeredConditions: opts.triggered as unknown as Prisma.InputJsonValue,
        blockedConditions: opts.blocked as unknown as Prisma.InputJsonValue,
      },
      update: {
        status: opts.status,
        alertMode: opts.alertMode ?? null,
        ruleId: opts.ruleId ?? null,
        triggeredConditions: opts.triggered as unknown as Prisma.InputJsonValue,
        blockedConditions: opts.blocked as unknown as Prisma.InputJsonValue,
      },
    })
    .catch(() => {});
}
