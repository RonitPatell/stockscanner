import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { track } from "@/lib/analytics/track";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

const ALLOWED = new Set([
  "too_expensive",
  "not_using",
  "missing_features",
  "switched_tool",
  "other",
]);

/** Optional cancel reason before / after billing portal cancel. */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = clientIp(req);
  const rl = await rateLimit(`cancel-reason:${session.user.id}:${ip}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(rl, 10) }
    );
  }

  const body = await req.json().catch(() => ({}));
  const reason = String(body.reason ?? "");
  if (!ALLOWED.has(reason)) {
    return NextResponse.json({ error: "Invalid reason" }, { status: 400 });
  }
  const detail =
    typeof body.detail === "string" ? body.detail.trim().slice(0, 200) : null;

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      cancelReason: reason,
      cancelReasonDetail: detail || null,
    },
  });

  void track("cancellation_reason", { reason });

  return NextResponse.json({ ok: true });
}
