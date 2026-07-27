import { NextRequest, NextResponse } from "next/server";
import {
  assertAnalyticsPrivacy,
  isFunnelEvent,
  track,
  type FunnelEvent,
} from "@/lib/analytics/track";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

/** Public funnel page-view / client events (scrubbed — no PII). */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const rl = await rateLimit(`analytics:${ip}`, 120, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many events" },
      { status: 429, headers: rateLimitHeaders(rl, 120) }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    assertAnalyticsPrivacy(body);
  } catch {
    return NextResponse.json({ error: "Invalid event payload" }, { status: 400 });
  }

  const event = (body as { event?: string }).event;
  if (!event || !isFunnelEvent(event)) {
    return NextResponse.json({ error: "Unknown event" }, { status: 400 });
  }

  // Only allow client to fire view / signup_started — sensitive events are server-only
  const clientAllowed: FunnelEvent[] = [
    "landing_view",
    "landing_cta_replay",
    "landing_cta_trial",
    "landing_case_study_click",
    "demo_view",
    "pricing_view",
    "signup_started",
  ];
  if (!clientAllowed.includes(event)) {
    return NextResponse.json({ error: "Event not allowed from client" }, { status: 403 });
  }

  const props = (body as { props?: Record<string, string | number | boolean> }).props;
  await track(event, props);
  return NextResponse.json({ ok: true });
}
