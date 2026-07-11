import { prisma } from "@/lib/prisma";
import { sendEmail, emailShell, APP_URL } from "@/lib/email";
import { sendPushNotification, type PushSubscriptionJson } from "@/lib/web-push";
import { buildSessionPlan } from "@/lib/session-plan";
import { getSpeedEdgeSummary } from "@/lib/speed-edge";
import { etDateKey } from "@/lib/brief-dispatch";

const DRIP: Record<
  number,
  { subject: string; title: string; body: (ctx: DripCtx) => string; push: (ctx: DripCtx) => string }
> = {
  1: {
    subject: "Day 1 — set alerts so you don’t miss the open",
    title: "Day 1: Turn on alerts",
    body: () =>
      `Your trial is live. Open <a href="${APP_URL}/settings" style="color:#34d399">Settings</a> and enable push + email (and Discord if you use it). Without alerts, Pro is just another tab.`,
    push: () => "Day 1: Enable push alerts in Settings — 60 seconds.",
  },
  2: {
    subject: "Day 2 — your session plan is ready",
    title: "Day 2: Trade the plan",
    body: (ctx) =>
      `This morning’s focus: <strong>${ctx.setupLine}</strong>. Skips: <strong>${ctx.skipLine}</strong>. Open <a href="${APP_URL}/desk" style="color:#34d399">Prop Desk</a> before you force a trade.`,
    push: (ctx) => `Day 2 plan: ${ctx.setupLine}`,
  },
  3: {
    subject: "Day 3 — skip the trap",
    title: "Day 3: Dilution radar",
    body: () =>
      `Offerings and ATM headlines destroy FOMO entries. Open judgment tools → Dilution radar, or use Prop Desk. Skipping one trap can pay for a month of Pro.`,
    push: () => "Day 3: Check Dilution radar before you chase green.",
  },
  4: {
    subject: "Day 4 — prove speed paid for itself",
    title: "Day 4: Edge recap",
    body: (ctx) =>
      `Paper speed edge (illustrative): <strong>$${ctx.edgeUsd.toFixed(0)}</strong> (~${ctx.months}× a $19.99 month). See Daily Edge on your dashboard — not advice, just the habit of measuring.`,
    push: (ctx) => `Day 4: Paper edge ~$${ctx.edgeUsd.toFixed(0)} vs $19.99`,
  },
  5: {
    subject: "Day 5 — share a catch",
    title: "Day 5: Social proof",
    body: () =>
      `Post a call on the Call Board or share <a href="${APP_URL}/today" style="color:#34d399">today’s free plan</a> / <a href="${APP_URL}/wins" style="color:#34d399">speed wins</a> with your group. Traders who share stick.`,
    push: () => "Day 5: Share /today or post a Call Board take.",
  },
  6: {
    subject: "Day 6 — trial ending soon",
    title: "Day 6: Keep the desk",
    body: (ctx) =>
      `Your trial wraps soon. You’ve seen the loop: see → skip → prove. Stay on Pro at $19.99/mo (or lock annual if offered at checkout). <a href="${APP_URL}/pricing" style="color:#34d399">Continue Pro</a> · Edge so far ~$${ctx.edgeUsd.toFixed(0)} paper.`,
    push: () => "Day 6: Trial ending soon — keep Pro for live alerts + desk.",
  },
};

interface DripCtx {
  setupLine: string;
  skipLine: string;
  edgeUsd: number;
  months: string;
}

function trialDayNumber(createdAt: Date): number {
  const start = new Date(createdAt);
  start.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.floor((now.getTime() - start.getTime()) / 86_400_000) + 1;
  return Math.min(6, Math.max(1, diff));
}

export async function dispatchTrialDrip(): Promise<{
  attempted: number;
  sent: number;
  skipped: number;
}> {
  const users = await prisma.user.findMany({
    where: {
      subscriptionStatus: "trialing",
      hasUsedTrial: true,
    },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      pushSubscription: true,
      trialDripDay: true,
      lastTrialDripAt: true,
    },
    take: 500,
  });

  const plan = await buildSessionPlan();
  const edge = await getSpeedEdgeSummary(8, 24).catch(() => null);
  const ctx: DripCtx = {
    setupLine: plan.setups.length
      ? plan.setups.map((s) => `${s.symbol} ${s.bias}`).join(" · ")
      : "check Prop Desk",
    skipLine: plan.skips.length
      ? plan.skips.map((s) => s.symbol).join(", ")
      : "none flagged",
    edgeUsd: edge?.totalEdgeUsd ?? 0,
    months: edge ? edge.monthsCovered.toFixed(1) : "0",
  };

  let sent = 0;
  let skipped = 0;
  const today = etDateKey();

  for (const user of users) {
    const day = trialDayNumber(user.createdAt);
    if (day <= (user.trialDripDay ?? 0)) {
      skipped++;
      continue;
    }
    if (user.lastTrialDripAt) {
      const sentKey = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(user.lastTrialDripAt);
      if (sentKey === today) {
        skipped++;
        continue;
      }
    }

    const drip = DRIP[day];
    if (!drip) {
      skipped++;
      continue;
    }

    let ok = false;
    if (process.env.RESEND_API_KEY) {
      const html = emailShell(
        drip.title,
        `<p style="color:#a1a1aa;margin:0 0 16px">Hey${user.name ? ` ${user.name.split(" ")[0]}` : ""},</p>
         <p style="color:#d4d4d8;margin:0 0 16px;line-height:1.6">${drip.body(ctx)}</p>
         <a href="${APP_URL}/dashboard" style="display:inline-block;background:#059669;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Open scanner</a>`
      );
      ok = await sendEmail(user.email, drip.subject, html);
    }

    if (user.pushSubscription) {
      const pushed = await sendPushNotification(
        user.pushSubscription as unknown as PushSubscriptionJson,
        {
          title: drip.title,
          body: drip.push(ctx),
          url: day === 2 || day === 6 ? "/desk" : "/dashboard",
        }
      );
      ok = ok || pushed;
    }

    if (ok) {
      await prisma.user.update({
        where: { id: user.id },
        data: { trialDripDay: day, lastTrialDripAt: new Date() },
      });
      sent++;
    } else {
      skipped++;
    }
  }

  return { attempted: users.length, sent, skipped };
}
