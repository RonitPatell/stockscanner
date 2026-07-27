import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { track } from "@/lib/analytics/track";
import {
  ALERT_STYLE_PRESETS,
  FOCUS_STARTER_WATCHLISTS,
  computeActivation,
  onboardingChecklistItems,
  parseOnboardingProgress,
  type AlertStyle,
  type OnboardingFocus,
  type OnboardingProgress,
} from "@/lib/onboarding";
import type { AlertRule } from "@/lib/alert-rules";
import { maybeMarkActivated, recordLastSeen } from "@/lib/activation";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

const FOCUSES: OnboardingFocus[] = ["small_cap", "biotech", "large_cap", "custom"];
const STYLES: AlertStyle[] = ["early", "confirmed", "risk_only"];

function normalizeSymbols(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw
        .map((s) => String(s).trim().toUpperCase())
        .filter((s) => /^[A-Z]{1,5}$/.test(s))
    ),
  ].slice(0, 40);
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  void recordLastSeen(session.user.id);

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      onboardingCompleted: true,
      onboardingProgress: true,
      tradingFocus: true,
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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const progress = parseOnboardingProgress(user.onboardingProgress);
  const activation = computeActivation(user);

  return NextResponse.json({
    onboardingCompleted: user.onboardingCompleted,
    progress,
    tradingFocus: user.tradingFocus,
    checklist: onboardingChecklistItems(progress),
    activation: {
      ...activation,
      activatedAt: user.activatedAt,
    },
    showWizard: !user.onboardingCompleted && !progress.skipped,
    showChecklist:
      (!user.onboardingCompleted || progress.skipped) &&
      !activation.activated &&
      (progress.skipped ||
        !progress.focusDone ||
        !progress.watchlistDone ||
        !progress.alertsDone),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = clientIp(req);
  const rl = await rateLimit(`onboarding:${session.user.id}:${ip}`, 40, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(rl, 40) }
    );
  }

  const body = (await req.json()) as Record<string, unknown>;
  const action = String(body.action ?? (body.completed !== undefined ? "complete" : ""));

  const current = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      onboardingProgress: true,
      watchlist: true,
      emailAlertsEnabled: true,
    },
  });
  if (!current) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let progress = parseOnboardingProgress(current.onboardingProgress);

  if (action === "skip" || body.skip === true) {
    progress = { ...progress, skipped: true, version: 1 };
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        onboardingCompleted: true,
        onboardingProgress: progress as unknown as Prisma.InputJsonValue,
      },
    });
    return NextResponse.json({ ok: true, progress, showChecklist: true });
  }

  if (action === "complete" || body.completed === true) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { onboardingCompleted: true },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "focus") {
    const focus = body.focus as OnboardingFocus;
    if (!FOCUSES.includes(focus)) {
      return NextResponse.json({ error: "Invalid focus" }, { status: 400 });
    }
    progress = {
      ...progress,
      focus,
      focusDone: true,
      stepsCompleted: Math.max(progress.stepsCompleted ?? 0, 1),
    };
    const data: Prisma.UserUpdateInput = {
      tradingFocus: focus,
      onboardingProgress: progress as unknown as Prisma.InputJsonValue,
    };
    if (focus !== "custom" && FOCUS_STARTER_WATCHLISTS[focus]) {
      // Starter list is optional apply — client may send applyStarter
      if (body.applyStarter === true) {
        data.watchlist = FOCUS_STARTER_WATCHLISTS[focus];
        progress.watchlistDone = true;
        progress.stepsCompleted = Math.max(progress.stepsCompleted ?? 0, 2);
        data.onboardingProgress = progress as unknown as Prisma.InputJsonValue;
      }
    }
    await prisma.user.update({ where: { id: session.user.id }, data });
    void track("onboarding_step_completed", { step: 1, focus });
    return NextResponse.json({ ok: true, progress });
  }

  if (action === "watchlist") {
    const symbols = normalizeSymbols(body.symbols);
    const useStarter = body.useStarter === true;
    const focus = (progress.focus || body.focus) as OnboardingFocus | undefined;
    let watchlist = symbols;
    if (useStarter && focus && focus !== "custom" && FOCUS_STARTER_WATCHLISTS[focus]) {
      watchlist = FOCUS_STARTER_WATCHLISTS[focus];
    }
    if (watchlist.length < 5) {
      return NextResponse.json(
        { error: "Add at least 5 symbols or select a starter watchlist" },
        { status: 400 }
      );
    }
    progress = {
      ...progress,
      watchlistDone: true,
      stepsCompleted: Math.max(progress.stepsCompleted ?? 0, 2),
    };
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        watchlist,
        onboardingProgress: progress as unknown as Prisma.InputJsonValue,
      },
    });
    void track("onboarding_step_completed", {
      step: 2,
      symbolCount: watchlist.length,
    });
    await maybeMarkActivated(session.user.id);
    return NextResponse.json({
      ok: true,
      progress,
      watchlistCount: watchlist.length,
    });
  }

  if (action === "alerts") {
    const style = body.style as AlertStyle;
    if (!STYLES.includes(style)) {
      return NextResponse.json({ error: "Invalid alert style" }, { status: 400 });
    }
    const preset = ALERT_STYLE_PRESETS[style];
    const rule: AlertRule = {
      id: `onboarding-${style}`,
      enabled: true,
      name: `${preset.label} watchlist`,
      scope: "watchlist",
      channels: ["email"],
      mode: preset.mode,
      ...preset.rule,
    };
    progress = {
      ...progress,
      alertsDone: true,
      stepsCompleted: Math.max(progress.stepsCompleted ?? 0, 3),
    };
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        emailAlertsEnabled: true,
        alertRules: [rule] as unknown as Prisma.InputJsonValue,
        onboardingProgress: progress as unknown as Prisma.InputJsonValue,
      },
    });
    void track("onboarding_step_completed", { step: 3, style });
    await maybeMarkActivated(session.user.id);
    return NextResponse.json({ ok: true, progress, style });
  }

  if (action === "test_alert_done") {
    progress = { ...progress, testAlertDone: true, alertsDone: true };
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        onboardingCompleted: true,
        onboardingProgress: progress as unknown as Prisma.InputJsonValue,
      },
    });
    return NextResponse.json({ ok: true, progress });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
