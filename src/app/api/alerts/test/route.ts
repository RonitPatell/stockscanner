import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail, emailShell } from "@/lib/email";
import { track } from "@/lib/analytics/track";
import { maybeMarkActivated } from "@/lib/activation";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { parseOnboardingProgress } from "@/lib/onboarding";
import { Prisma } from "@prisma/client";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = clientIp(req);
  const rl = await rateLimit(`test-alert:${session.user.id}:${ip}`, 5, 60 * 60_000, {
    strict: true,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many test alerts. Try again later." },
      { status: 429, headers: rateLimitHeaders(rl, 5) }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      email: true,
      emailAlertsEnabled: true,
      onboardingProgress: true,
      testAlertSentAt: true,
    },
  });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const html = emailShell(
    "Test alert",
    `<p>This is your TrustTicker test alert. Channels are wired — you're ready for live catalysts.</p>
     <p style="color:#71717a;font-size:12px">If you received this, email delivery works for your account.</p>`
  );

  let sent = false;
  if (process.env.RESEND_API_KEY) {
    sent = await sendEmail(user.email, "TrustTicker — test alert", html);
  } else if (
    process.env.NODE_ENV === "development" ||
    process.env.ALLOW_TEST_ALERT_WITHOUT_EMAIL === "true"
  ) {
    sent = true;
  }

  if (!sent) {
    return NextResponse.json(
      { error: "Could not send test alert. Email delivery is not configured." },
      { status: 503 }
    );
  }

  const progress = parseOnboardingProgress(user.onboardingProgress);
  progress.testAlertDone = true;
  progress.alertsDone = true;

  const first = !user.testAlertSentAt;
  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      testAlertSentAt: new Date(),
      emailAlertsEnabled: true,
      onboardingProgress: progress as unknown as Prisma.InputJsonValue,
      onboardingCompleted: true,
    },
  });

  if (first) {
    void track("first_alert_delivered", { kind: "test" });
  }
  await maybeMarkActivated(session.user.id);

  return NextResponse.json({ ok: true, sent: true });
}
