import { NextRequest, NextResponse } from "next/server";
import { requireTrustTickerAccess } from "@/lib/api-guard";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import {
  reorderConditionsBodySchema,
  reorderConditionsForUser,
  zodErrorMessage,
} from "@/lib/thesis";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PUT /api/thesis/[id]/conditions/reorder */
export async function PUT(req: NextRequest, ctx: Ctx) {
  const gate = await requireTrustTickerAccess();
  if (gate.error) return gate.error;

  const { id } = await ctx.params;
  if (!id || id.length > 64) {
    return NextResponse.json(
      { error: "Invalid thesis id", code: "INVALID" },
      { status: 400 }
    );
  }

  const ip = clientIp(req);
  const rl = await rateLimit(
    `thesis-cond-reorder:${gate.user.id}:${ip}`,
    30,
    60_000
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many thesis changes. Try again shortly." },
      { status: 429, headers: rateLimitHeaders(rl, 30) }
    );
  }

  const raw = await req.json().catch(() => null);
  const parsed = reorderConditionsBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: zodErrorMessage(parsed.error), code: "INVALID" },
      { status: 400 }
    );
  }

  const result = await reorderConditionsForUser(
    gate.user.id,
    id,
    parsed.data.orderedIds
  );
  if (!result.ok) {
    const status = result.code === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status }
    );
  }

  return NextResponse.json({ thesis: result.thesis });
}
