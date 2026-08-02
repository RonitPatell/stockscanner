import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { hasActiveSubscription } from "@/lib/subscription";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import {
  recordMonitorBetaFeedback,
  recordMonitorErrorSession,
  resolveMonitorRolloutForUser,
} from "@/lib/monitor/rollout";

export const dynamic = "force-dynamic";

/**
 * Monitor staged rollout — eligibility, opt-out, feedback, technical error sessions.
 * Never returns secrets. Never treats beta metrics as SLAs.
 */
export async function GET(req: NextRequest) {
  const gate = await requireUser();
  if (gate.error) return gate.error;

  const rl = await rateLimit(
    `monitor-rollout:get:${gate.user.id}:${clientIp(req)}`,
    60,
    60_000,
    { strict: true }
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(rl, 60) }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: gate.user.id },
    select: {
      email: true,
      subscriptionStatus: true,
      subscriptionEndsAt: true,
      monitorBetaOptOut: true,
    },
  });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resolved = await resolveMonitorRolloutForUser({
    userId: gate.user.id,
    email: user.email,
    isEligibleSubscriber: hasActiveSubscription(user),
    optOut: user.monitorBetaOptOut === true,
  });

  return NextResponse.json({
    enabled: resolved.masterEnabled,
    inCohort: resolved.inCohort,
    optedOut: resolved.optedOut,
    rolledBack: resolved.rolledBack,
    stage: resolved.stage,
    reason: resolved.reason,
    flags: resolved.flags,
    fallback: {
      view: resolved.fallbackView,
      shell: resolved.fallbackShell,
      feedHref: "/dashboard?view=feed",
      legacyHref: "/dashboard?shell=legacy",
    },
    diagnostics: {
      buildId: resolved.diagnostics.buildId,
      gitSha: resolved.diagnostics.gitSha,
      engines: resolved.diagnostics.engines,
      disclaimer: resolved.diagnostics.disclaimer,
    },
    metricsDisclaimer:
      "Beta observations are diagnostic only — not service guarantees.",
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireUser();
  if (gate.error) return gate.error;

  const ip = clientIp(req);
  const rl = await rateLimit(
    `monitor-rollout:post:${gate.user.id}:${ip}`,
    30,
    60_000,
    { strict: true }
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(rl, 30) }
    );
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "");

  if (action === "set_opt_out") {
    const optOut = body.optOut === true;
    await prisma.user.update({
      where: { id: gate.user.id },
      data: { monitorBetaOptOut: optOut },
      select: { id: true },
    });
    return NextResponse.json({ ok: true, monitorBetaOptOut: optOut });
  }

  if (action === "feedback") {
    const row = await recordMonitorBetaFeedback({
      userId: gate.user.id,
      category: body.category,
      message: body.message,
      path: body.path,
      buildId: body.buildId,
      stage: body.stage,
    });
    return NextResponse.json({ ok: true, id: row.id });
  }

  if (action === "error_session") {
    const row = await recordMonitorErrorSession({
      userId: gate.user.id,
      message: body.message,
      name: body.name,
      stack: body.stack,
      path: body.path,
      buildId: body.buildId,
      breadcrumbs: body.breadcrumbs,
    });
    return NextResponse.json({ ok: true, id: row.id });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
