import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ScannerFilters } from "@/types";
import { normalizeAlertRules } from "@/lib/alert-rules";
import { assertDiscordWebhookOrThrow } from "@/lib/discord-webhook";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

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
      emailAlertsEnabled: true,
      emailBriefEnabled: true,
      onboardingCompleted: true,
      pushSubscription: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ...user,
    discordWebhookMasked: redactWebhook(user.discordWebhook),
    pushSubscription: user.pushSubscription ? { configured: true } : null,
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
  if (body.discordWebhook !== undefined) {
    try {
      discordWebhook = assertDiscordWebhookOrThrow(String(body.discordWebhook ?? ""));
    } catch {
      return NextResponse.json(
        { error: "Discord webhook must be a valid discord.com webhook URL" },
        { status: 400 }
      );
    }
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
          { error: "That phone number is already in use" },
          { status: 409 }
        );
      }
    }
    phoneNumber = phone || null;
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      ...(discordWebhook !== undefined && { discordWebhook: discordWebhook || null }),
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
    },
  });

  return NextResponse.json({
    discordWebhook: user.discordWebhook,
    discordWebhookMasked: redactWebhook(user.discordWebhook),
    phoneNumber: user.phoneNumber,
    smsAlertsEnabled: user.smsAlertsEnabled,
    discordAlertsEnabled: user.discordAlertsEnabled,
    emailAlertsEnabled: user.emailAlertsEnabled,
    emailBriefEnabled: user.emailBriefEnabled,
    watchlist: user.watchlist,
    scannerFilters: user.scannerFilters,
    alertRules: user.alertRules,
  });
}
