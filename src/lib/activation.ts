import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeActivation } from "@/lib/onboarding";
import { track } from "@/lib/analytics/track";

/** Recompute activation; set activatedAt + track once when criteria met. */
export async function maybeMarkActivated(userId: string): Promise<{
  activated: boolean;
  justActivated: boolean;
  missing: string[];
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      watchlist: true,
      emailAlertsEnabled: true,
      discordAlertsEnabled: true,
      smsAlertsEnabled: true,
      pushSubscription: true,
      catalystsExpandedCount: true,
      testAlertSentAt: true,
      activatedAt: true,
    },
  });
  if (!user) {
    return { activated: false, justActivated: false, missing: ["User not found"] };
  }

  const state = computeActivation(user);
  if (state.activated && !user.activatedAt) {
    await prisma.user.update({
      where: { id: userId },
      data: { activatedAt: new Date() },
    });
    void track("activation_completed");
    return { activated: true, justActivated: true, missing: [] };
  }

  return {
    activated: state.activated,
    justActivated: false,
    missing: state.missing,
  };
}

export async function bumpCatalystExpand(userId: string): Promise<number> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { catalystsExpandedCount: { increment: 1 } },
    select: { catalystsExpandedCount: true },
  });
  await maybeMarkActivated(userId);
  return user.catalystsExpandedCount;
}

export async function recordLastSeen(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true, lastSeenAt: true, cohortReturns: true },
  });
  if (!user) return;

  const now = new Date();
  const created = user.createdAt.getTime();
  const ageDays = (now.getTime() - created) / (24 * 3600_000);
  const cohort =
    user.cohortReturns && typeof user.cohortReturns === "object"
      ? ({ ...(user.cohortReturns as Record<string, boolean>) } as Record<string, boolean>)
      : {};

  let changed = false;
  if (ageDays >= 2 && !cohort.d2) {
    cohort.d2 = true;
    changed = true;
    void track("day_2_return");
  }
  if (ageDays >= 5 && !cohort.d5) {
    cohort.d5 = true;
    changed = true;
    void track("day_5_return");
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      lastSeenAt: now,
      ...(changed
        ? { cohortReturns: cohort as Prisma.InputJsonValue }
        : {}),
    },
  });
}
