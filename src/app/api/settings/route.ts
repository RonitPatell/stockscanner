import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ScannerFilters } from "@/types";
import { normalizeAlertRules } from "@/lib/alert-rules";
import { assertDiscordWebhookOrThrow } from "@/lib/discord-webhook";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import {
  hasTrustTickerAccess,
  watchlistLimitFor,
} from "@/lib/subscription";
import { getTrialAccessDisplay } from "@/lib/trial";

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function normalizeWatchlist(raw: unknown): string[] | undefined {
  if (raw == null) return undefined;
  if (!Array.isArray(raw)) return undefined;
  return [
    ...new Set(
      raw
        .map((s) => String(s).trim().toUpperCase())
        .filter((s) => /^[A-Z]{1,5}$/.test(s))
    ),
  ];
}

function normalizeScannerFilters(raw: unknown): ScannerFilters | undefined {
  if (raw == null) return undefined;
  if (typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const out: ScannerFilters = {};
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const arrStr = (v: unknown) => (Array.isArray(v) ? v.map(String) : undefined);

  out.minSentiment = num(r.minSentiment);
  out.maxSentiment = num(r.maxSentiment);
  out.minUrgency = num(r.minUrgency);
  out.minPrice = num(r.minPrice);
  out.maxPrice = num(r.maxPrice);
  out.minFloatM = num(r.minFloatM);
  out.maxFloatM = num(r.maxFloatM);
  out.minChange = num(r.minChange);
  out.maxChange = num(r.maxChange);
  out.minRvol = num(r.minRvol);
  out.premarketOnly = bool(r.premarketOnly);
  out.search = str(r.search);
  out.catalystTypes = arrStr(r.catalystTypes);

  return Object.keys(out).length > 0 ? out : {};
}

function redactWebhook(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const token = parts[3] || "";
    const masked =
      token.length > 4 ? `${"•".repeat(Math.min(12, token.length - 4))}${token.slice(-4)}` : "••••";
    return `${u.origin}/api/webhooks/${parts[2] || "?"}/${masked}`;
  } catch {
    return "••••";
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      discordWebhook: true,
      phoneNumber: true,
      smsAlertsEnabled: true,
      discordAlertsEnabled: true,
      watchlist: true,
      scannerFilters: true,
      alertRules: true,
      subscriptionStatus: true,
      subscriptionEndsAt: true,
      hasUsedTrial: true,
      trialConsumedAt: true,
      trialStartedAt: true,
      trialEndsAt: true,
      emailAlertsEnabled: true,
      emailBriefEnabled: true,
      onboardingCompleted: true,
      pushSubscription: true,
      monitorBetaOptOut: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const trialAccess = getTrialAccessDisplay(user);

  return NextResponse.json({
    discordWebhookConfigured: Boolean(user.discordWebhook),
    discordWebhookMasked: redactWebhook(user.discordWebhook),
    phoneNumber: user.phoneNumber,
    smsAlertsEnabled: user.smsAlertsEnabled,
    discordAlertsEnabled: user.discordAlertsEnabled,
    watchlist: user.watchlist,
    scannerFilters: user.scannerFilters,
    alertRules: user.alertRules,
    subscriptionStatus: user.subscriptionStatus,
    subscriptionEndsAt: user.subscriptionEndsAt,
    trialAccessLabel: trialAccess.label,
    trialAccessKind: trialAccess.kind,
    trialEndsAt: user.trialEndsAt,
    hasTrustTickerAccess: hasTrustTickerAccess(user),
    emailAlertsEnabled: user.emailAlertsEnabled,
    emailBriefEnabled: user.emailBriefEnabled,
    onboardingCompleted: user.onboardingCompleted,
    pushSubscription: user.pushSubscription ? { configured: true } : null,
    monitorBetaOptOut: user.monitorBetaOptOut === true,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = clientIp(req);
  const rl = await rateLimit(`settings:ip:${ip}:${session.user.id}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many updates" },
      { status: 429, headers: rateLimitHeaders(rl, 60) }
    );
  }

  const body = await req.json();
  const watchlist = normalizeWatchlist(body.watchlist);
  const scannerFilters = normalizeScannerFilters(body.scannerFilters);
  const alertRules =
    body.alertRules !== undefined ? normalizeAlertRules(body.alertRules) : undefined;

  let discordWebhook: string | undefined;
  let clearDiscordWebhook = false;
  if (body.discordWebhook !== undefined) {
    const raw = String(body.discordWebhook ?? "").trim();
    // Empty string clears; omit / whitespace-only leaves existing webhook unchanged
    if (!raw) {
      clearDiscordWebhook = true;
      discordWebhook = undefined;
    } else {
      try {
        discordWebhook = assertDiscordWebhookOrThrow(raw);
      } catch {
        return NextResponse.json(
          { error: "Discord webhook must be a valid discord.com webhook URL" },
          { status: 400 }
        );
      }
    }
  }

  const existing = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      phoneNumber: true,
      smsAlertsEnabled: true,
      hasUsedTrial: true,
      email: true,
      subscriptionStatus: true,
      subscriptionEndsAt: true,
      planTier: true,
      cancelAtPeriodEnd: true,
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasTrustTickerAccess(existing)) {
    return NextResponse.json(
      {
        error: "TrustTicker subscription required",
        code: "SUBSCRIPTION_REQUIRED",
      },
      { status: 403 }
    );
  }

  if (watchlist !== undefined) {
    const limit = watchlistLimitFor(existing);
    if (watchlist.length > limit) {
      return NextResponse.json(
        {
          error: "Watchlist update exceeds the allowed size for your account.",
          code: "SUBSCRIPTION_REQUIRED",
          limit: Number.isFinite(limit) ? limit : undefined,
        },
        { status: 403 }
      );
    }
  }

  if (alertRules !== undefined && !hasTrustTickerAccess(existing)) {
    return NextResponse.json(
      {
        error: "TrustTicker subscription required for alert rules",
        code: "SUBSCRIPTION_REQUIRED",
      },
      { status: 403 }
    );
  }

  let phoneNumber: string | null | undefined;
  if (body.phoneNumber !== undefined) {
    const phone = normalizePhone(String(body.phoneNumber ?? ""));
    if (phone && (phone.length < 10 || phone.length > 15)) {
      return NextResponse.json({ error: "Enter a valid phone number" }, { status: 400 });
    }
    if (phone) {
      const taken = await prisma.user.findFirst({
        where: { phoneNumber: phone, NOT: { id: session.user.id } },
        select: { id: true },
      });
      if (taken) {
        return NextResponse.json(
          { error: "Could not update phone number. Try a different number." },
          { status: 409 }
        );
      }
    }
    phoneNumber = phone || null;
  }

  const nextSms =
    body.smsAlertsEnabled !== undefined
      ? Boolean(body.smsAlertsEnabled)
      : existing.smsAlertsEnabled;
  const nextPhone =
    phoneNumber !== undefined ? phoneNumber : existing.phoneNumber;

  if (nextSms && !nextPhone) {
    return NextResponse.json(
      { error: "Add a phone number to enable SMS alerts." },
      { status: 400 }
    );
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      ...(clearDiscordWebhook && { discordWebhook: null }),
      ...(discordWebhook !== undefined && { discordWebhook }),
      ...(phoneNumber !== undefined && { phoneNumber }),
      ...(body.smsAlertsEnabled !== undefined && { smsAlertsEnabled: body.smsAlertsEnabled }),
      ...(body.discordAlertsEnabled !== undefined && {
        discordAlertsEnabled: body.discordAlertsEnabled,
      }),
      ...(body.emailAlertsEnabled !== undefined && { emailAlertsEnabled: body.emailAlertsEnabled }),
      ...(body.emailBriefEnabled !== undefined && { emailBriefEnabled: body.emailBriefEnabled }),
      ...(watchlist !== undefined && { watchlist }),
      ...(scannerFilters !== undefined && {
        scannerFilters: scannerFilters as Prisma.InputJsonValue,
      }),
      ...(alertRules !== undefined && {
        alertRules: alertRules as unknown as Prisma.InputJsonValue,
      }),
      ...(body.monitorBetaOptOut !== undefined && {
        monitorBetaOptOut: body.monitorBetaOptOut === true,
      }),
    },
    select: {
      discordWebhook: true,
      phoneNumber: true,
      smsAlertsEnabled: true,
      discordAlertsEnabled: true,
      emailAlertsEnabled: true,
      emailBriefEnabled: true,
      watchlist: true,
      scannerFilters: true,
      alertRules: true,
      monitorBetaOptOut: true,
    },
  });

  // If phone is added after a trial was used, claim the hash for abuse prevention
  if (
    phoneNumber &&
    existing.hasUsedTrial &&
    phoneNumber !== existing.phoneNumber
  ) {
    const { recordTrialClaims } = await import("@/lib/trial-claims");
    await recordTrialClaims({ email: existing.email, phoneNumber });
  }

  if (watchlist !== undefined) {
    await syncCoverageFromWatchlist(user.watchlist);
  }

  return NextResponse.json({
    discordWebhookConfigured: Boolean(user.discordWebhook),
    discordWebhookMasked: redactWebhook(user.discordWebhook),
    phoneNumber: user.phoneNumber,
    smsAlertsEnabled: user.smsAlertsEnabled,
    discordAlertsEnabled: user.discordAlertsEnabled,
    emailAlertsEnabled: user.emailAlertsEnabled,
    emailBriefEnabled: user.emailBriefEnabled,
    watchlist: user.watchlist,
    scannerFilters: user.scannerFilters,
    alertRules: user.alertRules,
    monitorBetaOptOut: user.monitorBetaOptOut === true,
  });
}

async function syncCoverageFromWatchlist(symbols: string[] | undefined) {
  if (!symbols?.length) return;
  try {
    const { syncWatchlistCoverage } = await import("@/lib/coverage/coverage-service");
    await syncWatchlistCoverage(symbols);
  } catch {
    /* non-fatal */
  }
}
