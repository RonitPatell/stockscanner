import { NextRequest, NextResponse } from "next/server";
import { requireTrustTickerAccess } from "@/lib/api-guard";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { trackRetention } from "@/lib/analytics/retention";
import {
  updateWatchtowerEventState,
  watchtowerEventStateBodySchema,
  zodErrorMessage,
} from "@/lib/watchtower";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/watchtower/events/[id]
 * Update private read / dismiss state for a monitored CompanyEvent.
 */
export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const gate = await requireTrustTickerAccess();
  if (gate.error) return gate.error;

  const { id } = await ctx.params;
  if (!id || id.length > 64) {
    return NextResponse.json(
      { error: "Invalid event id", code: "INVALID" },
      { status: 400 }
    );
  }

  const ip = clientIp(req);
  const rl = await rateLimit(
    `watchtower-state:${gate.user.id}:${ip}`,
    60,
    60_000
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many updates. Try again shortly." },
      { status: 429, headers: rateLimitHeaders(rl, 60) }
    );
  }

  const raw = await req.json().catch(() => null);
  const parsed = watchtowerEventStateBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: zodErrorMessage(parsed.error), code: "INVALID" },
      { status: 400 }
    );
  }

  if (parsed.data.opened) {
    void trackRetention("watchtower_event_opened", { userId: gate.user.id });
  }
  if (parsed.data.read === true) {
    void trackRetention("event_marked_reviewed", { userId: gate.user.id });
  }

  const result = await updateWatchtowerEventState(
    gate.user.id,
    id,
    parsed.data
  );
  if (!result.ok) {
    const status =
      result.code === "NOT_FOUND"
        ? 404
        : result.code === "NOT_MONITORED"
          ? 403
          : 400;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status }
    );
  }

  return NextResponse.json({
    eventId: result.eventId,
    readState: result.readState,
  });
}
