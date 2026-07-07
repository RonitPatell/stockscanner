import { NextRequest, NextResponse } from "next/server";
import { ingestAndAnalyzeNews } from "@/lib/catalyst-engine";
import { prisma } from "@/lib/prisma";
import { sendDiscordWebhook } from "@/lib/alerts";

export const dynamic = "force-dynamic";

// Optional: ping this from cron-job.org (free) every 5 min for background alerts
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const catalysts = await ingestAndAnalyzeNews();

    const alertUsers = await prisma.user.findMany({
      where: {
        subscriptionStatus: "active",
        discordAlertsEnabled: true,
        discordWebhook: { not: null },
      },
    });

    const highUrgency = catalysts.filter((c) => (c.urgencyScore ?? 0) >= 70);
    let alertsSent = 0;

    for (const user of alertUsers) {
      for (const catalyst of highUrgency.slice(0, 3)) {
        if (user.discordWebhook) {
          const sent = await sendDiscordWebhook(user.discordWebhook, catalyst);
          if (sent) alertsSent++;
        }
      }
    }

    return NextResponse.json({ ingested: catalysts.length, alertsSent });
  } catch (error) {
    console.error("Cron ingest error:", error);
    return NextResponse.json({ error: "Ingest failed" }, { status: 500 });
  }
}
