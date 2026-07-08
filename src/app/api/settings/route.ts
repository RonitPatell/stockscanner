import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function normalizeWatchlist(raw: unknown): string[] | undefined {
  if (raw == null) return undefined;
  if (!Array.isArray(raw)) return undefined;
  return [...new Set(raw.map((s) => String(s).trim().toUpperCase()).filter((s) => /^[A-Z]{1,5}$/.test(s)))];
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

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      ...(body.discordWebhook !== undefined && { discordWebhook: body.discordWebhook }),
      ...(body.phoneNumber !== undefined && { phoneNumber: body.phoneNumber }),
      ...(body.smsAlertsEnabled !== undefined && { smsAlertsEnabled: body.smsAlertsEnabled }),
      ...(body.discordAlertsEnabled !== undefined && { discordAlertsEnabled: body.discordAlertsEnabled }),
      ...(watchlist !== undefined && { watchlist }),
    },
  });

  return NextResponse.json({
    discordWebhook: user.discordWebhook,
    phoneNumber: user.phoneNumber,
    smsAlertsEnabled: user.smsAlertsEnabled,
    discordAlertsEnabled: user.discordAlertsEnabled,
    watchlist: user.watchlist,
  });
}
