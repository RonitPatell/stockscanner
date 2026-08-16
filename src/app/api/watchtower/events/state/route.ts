import { NextRequest, NextResponse } from "next/server";
import { requireTrustTickerAccess } from "@/lib/api-guard";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import {
  batchUpdateWatchtowerEventState,
  watchtowerBatchStateBodySchema,
  zodErrorMessage,
} from "@/lib/watchtower";

export const dynamic = "force-dynamic";

/**
 * POST /api/watchtower/events/state
 * Batch mark read / dismiss for monitored events (session-scoped).
 */
export async function POST(req: NextRequest) {
  const gate = await requireTrustTickerAccess();
  if (gate.error) return gate.error;

  const ip = clientIp(req);
  const rl = await rateLimit(
    `watchtower-batch:${gate.user.id}:${ip}`,
    20,
    60_000
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many batch updates. Try again shortly." },
      { status: 429, headers: rateLimitHeaders(rl, 20) }
    );
  }

  const raw = await req.json().catch(() => null);
  const parsed = watchtowerBatchStateBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: zodErrorMessage(parsed.error), code: "INVALID" },
      { status: 400 }
    );
  }

  const result = await batchUpdateWatchtowerEventState(gate.user.id, {
    eventIds: parsed.data.eventIds,
    read: parsed.data.read,
    dismissed: parsed.data.dismissed,
  });

  return NextResponse.json(result);
}
