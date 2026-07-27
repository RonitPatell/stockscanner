import { NextRequest, NextResponse } from "next/server";
import {
  isDemoAnalyticsEvent,
  trackDemoEvent,
} from "@/lib/demo";
import { rateLimit, clientIp, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Public analytics — event name only. Rejects any extra PII fields. */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const rl = await rateLimit(`demo:evt:${ip}`, 120, 60_000, { strict: true });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(rl, 120) }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const obj = body as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length !== 1 || keys[0] !== "event") {
    return NextResponse.json(
      { error: "Only { event } is allowed" },
      { status: 400 }
    );
  }

  const event = obj.event;
  if (typeof event !== "string" || !isDemoAnalyticsEvent(event)) {
    return NextResponse.json({ error: "Unknown event" }, { status: 400 });
  }

  await trackDemoEvent(event);
  return NextResponse.json(
    { ok: true },
    { headers: rateLimitHeaders(rl, 120) }
  );
}
