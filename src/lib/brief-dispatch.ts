import { prisma } from "./prisma";
import { buildWatchlistBrief } from "./briefs";
import { sendDailyBriefEmail } from "./email-brief";
import { sendPushAlert, type PushSubscriptionJson } from "./web-push";

/** Current calendar date in America/New_York as YYYY-MM-DD */
export function etDateKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function alreadySentToday(sentAt: Date | null | undefined): boolean {
  if (!sentAt) return false;
  const sentKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(sentAt);
  return sentKey === etDateKey();
}

export async function dispatchDailyBriefs(kind: "morning" | "eod"): Promise<{
  attempted: number;
  sent: number;
  skipped: number;
}> {
  const users = await prisma.user.findMany({
    where: {
      OR: [{ subscriptionStatus: "active" }, { subscriptionStatus: "trialing" }],
      emailBriefEnabled: true,
      watchlist: { isEmpty: false },
    },
    select: {
      id: true,
      email: true,
      pushSubscription: true,
      lastMorningBriefSentAt: true,
      lastEodBriefSentAt: true,
    },
  });

  let sent = 0;
  let skipped = 0;

  for (const user of users) {
    const lastSent =
      kind === "morning" ? user.lastMorningBriefSentAt : user.lastEodBriefSentAt;
    if (alreadySentToday(lastSent)) {
      skipped++;
      continue;
    }

    const brief = await buildWatchlistBrief(user.id, kind);
    if (!brief || brief.sections.every((s) => s.items.length === 0)) {
      skipped++;
      continue;
    }

    let ok = false;
    if (process.env.RESEND_API_KEY) {
      ok = await sendDailyBriefEmail(user.email, brief);
    }

    if (user.pushSubscription) {
      try {
        await sendPushAlert(
          user.pushSubscription as unknown as PushSubscriptionJson,
          {
            id: "brief",
            symbol: brief.watchlist[0] ?? "BRIEF",
            headline: brief.summary,
            source: "TrustTicker",
            publishedAt: new Date().toISOString(),
          },
          kind === "morning" ? "Morning Brief" : "EOD Recap"
        );
        ok = true;
      } catch {
        /* email may still have sent */
      }
    }

    if (ok) {
      await prisma.user.update({
        where: { id: user.id },
        data:
          kind === "morning"
            ? { lastMorningBriefSentAt: new Date() }
            : { lastEodBriefSentAt: new Date() },
      });
      sent++;
    } else {
      skipped++;
    }
  }

  return { attempted: users.length, sent, skipped };
}
