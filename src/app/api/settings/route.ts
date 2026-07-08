import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ScannerFilters } from "@/types";
import { normalizeAlertRules } from "@/lib/alert-rules";

function normalizeWatchlist(raw: unknown): string[] | undefined {
  if (raw == null) return undefined;
  if (!Array.isArray(raw)) return undefined;
  return [...new Set(raw.map((s) => String(s).trim().toUpperCase()).filter((s) => /^[A-Z]{1,5}$/.test(s)))];
}

function normalizeScannerFilters(raw: unknown): ScannerFilters | undefined {
  if (raw == null) return undefined;
  if (typeof raw !== "object") return undefined;
  // Trust client shape; only shallow-sanitize obvious fields
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

  // Drop empty object to avoid needless DB writes
  return Object.keys(out).length > 0 ? out : {};
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
    },
  });

  return NextResponse.json(user);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const watchlist = normalizeWatchlist(body.watchlist);
  const scannerFilters = normalizeScannerFilters(body.scannerFilters);
  const alertRules =
    body.alertRules !== undefined ? normalizeAlertRules(body.alertRules) : undefined;

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      ...(body.discordWebhook !== undefined && { discordWebhook: body.discordWebhook }),
      ...(body.phoneNumber !== undefined && { phoneNumber: body.phoneNumber }),
      ...(body.smsAlertsEnabled !== undefined && { smsAlertsEnabled: body.smsAlertsEnabled }),
      ...(body.discordAlertsEnabled !== undefined && { discordAlertsEnabled: body.discordAlertsEnabled }),
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
    phoneNumber: user.phoneNumber,
    smsAlertsEnabled: user.smsAlertsEnabled,
    discordAlertsEnabled: user.discordAlertsEnabled,
    watchlist: user.watchlist,
    scannerFilters: user.scannerFilters,
    alertRules: user.alertRules,
  });
}
