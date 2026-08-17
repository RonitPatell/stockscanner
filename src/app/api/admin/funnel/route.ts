import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-guard";
import {
  FUNNEL_EVENTS,
  getCancellationReasonCounts,
  getFunnelDayCounts,
  getFunnelEventCounts,
  type FunnelEvent,
} from "@/lib/analytics/track";
import { collectRetentionMetrics } from "@/lib/analytics/retention";
import { prisma } from "@/lib/prisma";

function pct(num: number, den: number): number {
  if (den <= 0) return 0;
  return Math.round((num / den) * 1000) / 10;
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const day = req.nextUrl.searchParams.get("day")?.slice(0, 10) || null;
  const events = day ? await getFunnelDayCounts(day) : await getFunnelEventCounts();
  const full = day
    ? ({ ...Object.fromEntries(FUNNEL_EVENTS.map((e) => [e, 0])), ...events } as Record<
        FunnelEvent,
        number
      >)
    : (events as Record<FunnelEvent, number>);

  const landing = full.landing_view || 0;
  const signupStarted = full.signup_started || 0;
  const signupCompleted = full.signup_completed || 0;
  const checkout = full.checkout_started || 0;
  const trial = full.trial_started || 0;
  const activated = full.activation_completed || 0;
  const paid = full.paid_conversion || 0;
  const cancel = full.cancellation || 0;

  const conversions = {
    landing_to_signup_started: pct(signupStarted, landing),
    signup_started_to_completed: pct(signupCompleted, signupStarted),
    signup_to_checkout: pct(checkout, signupCompleted),
    checkout_to_trial: pct(trial, checkout),
    trial_to_activation: pct(activated, trial),
    trial_to_paid: pct(paid, trial),
    paid_to_cancel: pct(cancel, paid),
  };

  const [usersTotal, usersActivated, usersTrialing, usersPaid] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { activatedAt: { not: null } } }),
    prisma.user.count({ where: { subscriptionStatus: "trialing" } }),
    prisma.user.count({ where: { subscriptionStatus: "active" } }),
  ]);

  const cancelReasons = await getCancellationReasonCounts();
  const retention = await collectRetentionMetrics();

  return NextResponse.json({
    day: day || "all",
    events: full,
    conversions,
    cohort: {
      usersTotal,
      usersActivated,
      usersTrialing,
      usersPaid,
      activationRate: pct(usersActivated, usersTotal),
    },
    cancelReasons,
    retention,
  });
}
