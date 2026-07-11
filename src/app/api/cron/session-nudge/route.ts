import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCachedFeed } from "@/lib/feed-cache";
import { buildActionPlaybook, isDilutionCatalyst } from "@/lib/action-playbook";
import { sendPushNotification } from "@/lib/web-push";
import type { CatalystItem } from "@/types";
import type { PushSubscriptionJson } from "@/lib/web-push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorize(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV === "development";
  return authHeader === `Bearer ${secret}`;
}

/**
 * Morning habit loop — push "3 setups / 2 skips" before the open.
 * Schedule ~7:25 ET weekdays (vercel: 25 12 * * 1-5).
 */
export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { items } = await getCachedFeed("all");
  const recent = items.slice(0, 80) as CatalystItem[];
  const scored = recent.map((c) => ({ c, playbook: buildActionPlaybook(c) }));

  const setups = scored
    .filter(
      ({ playbook, c }) =>
        (playbook.bias === "long" || playbook.bias === "short") &&
        playbook.antiFomoScore < 70 &&
        Math.abs(c.changePercent ?? 0) >= 1.5
    )
    .sort((a, b) => b.playbook.conviction - a.playbook.conviction)
    .slice(0, 3);

  const skips = scored
    .filter(
      ({ c, playbook }) =>
        isDilutionCatalyst(c) ||
        playbook.bias === "avoid" ||
        playbook.antiFomoScore >= 75
    )
    .slice(0, 2);

  const setupLine = setups.length
    ? setups.map((s) => `${s.c.symbol} ${s.playbook.bias}`).join(" · ")
    : "No high-conviction setups yet — check the desk";
  const skipLine = skips.length
    ? `Skip: ${skips.map((s) => s.c.symbol).join(", ")}`
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
    setups: setups.length,
    skips: skips.length,
    pushed: sent,
    finishedAt: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
