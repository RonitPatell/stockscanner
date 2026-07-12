import { NextRequest, NextResponse } from "next/server";
import { authorizeCron, cronUnauthorized } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { buildSessionPlan } from "@/lib/session-plan";
import { sendPushNotification } from "@/lib/web-push";
import type { PushSubscriptionJson } from "@/lib/web-push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Morning habit loop — push "3 setups / 2 skips" before the open.
 * Schedule ~7:25 ET weekdays (vercel: 25 12 * * 1-5).
 */
export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) return cronUnauthorized();

  const plan = await buildSessionPlan();

  const setupLine = plan.setups.length
    ? plan.setups.map((s) => `${s.symbol} ${s.bias}`).join(" · ")
    : "No high-conviction setups yet — check the desk";
  const skipLine = plan.skips.length
    ? `Skip: ${plan.skips.map((s) => s.symbol).join(", ")}`
    : "No dilution skips flagged";

  const users = await prisma.user.findMany({
    where: {
      subscriptionStatus: { in: ["active", "trialing"] },
    },
    select: { id: true, pushSubscription: true },
    take: 500,
  });

  let sent = 0;
  for (const user of users) {
    if (!user.pushSubscription || typeof user.pushSubscription !== "object") continue;
    const ok = await sendPushNotification(
      user.pushSubscription as unknown as PushSubscriptionJson,
      {
        title: "Session plan ready",
        body: `${setupLine}. ${skipLine}`,
        url: "/desk",
      }
    );
    if (ok) sent += 1;
  }

  return NextResponse.json({
    ok: true,
    setups: plan.setups.length,
    skips: plan.skips.length,
    pushed: sent,
    finishedAt: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
