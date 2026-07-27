import { NextRequest, NextResponse } from "next/server";
import {
  assertNoPrivateFields,
  DEMO_MODES,
  getPublicDemoPayload,
  type DemoMode,
} from "@/lib/demo";
import { rateLimit, clientIp, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ip = clientIp(req);
  const rl = await rateLimit(`demo:get:${ip}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(rl, 60) }
    );
  }

  const raw = req.nextUrl.searchParams.get("mode")?.toUpperCase() ?? null;
  const mode =
    raw && (DEMO_MODES as readonly string[]).includes(raw)
      ? (raw as DemoMode)
      : null;

  const payload = await getPublicDemoPayload(mode);
  assertNoPrivateFields(payload);

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      ...rateLimitHeaders(rl, 60),
    },
  });
}
