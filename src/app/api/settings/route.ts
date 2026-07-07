import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      discordWebhook: body.discordWebhook,
      phoneNumber: body.phoneNumber,
      smsAlertsEnabled: body.smsAlertsEnabled,
      discordAlertsEnabled: body.discordAlertsEnabled,
      watchlist: body.watchlist,
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
