import { NextRequest, NextResponse } from "next/server";
import { requireTrustTickerAccess } from "@/lib/api-guard";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import {
  deleteConditionForUser,
  updateConditionBodySchema,
  updateConditionForUser,
  zodErrorMessage,
} from "@/lib/thesis";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; conditionId: string }> };

/** PATCH /api/thesis/[id]/conditions/[conditionId] */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const gate = await requireTrustTickerAccess();
  if (gate.error) return gate.error;

  const { id, conditionId } = await ctx.params;
  if (!id || !conditionId || id.length > 64 || conditionId.length > 64) {
    return NextResponse.json(
      { error: "Invalid id", code: "INVALID" },
      { status: 400 }
    );
  }

  const ip = clientIp(req);
  const rl = await rateLimit(
    `thesis-cond-patch:${gate.user.id}:${ip}`,
    60,
    60_000
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many thesis changes. Try again shortly." },
      { status: 429, headers: rateLimitHeaders(rl, 60) }
    );
  }

  const raw = await req.json().catch(() => null);
  const parsed = updateConditionBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: zodErrorMessage(parsed.error), code: "INVALID" },
      { status: 400 }
    );
  }

  const result = await updateConditionForUser(
    gate.user.id,
    id,
    conditionId,
    parsed.data
  );
  if (!result.ok) {
    const status = result.code === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status }
    );
  }

  return NextResponse.json({
    thesis: result.thesis,
    conditionId: result.conditionId,
  });
}

/** DELETE /api/thesis/[id]/conditions/[conditionId] */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const gate = await requireTrustTickerAccess();
  if (gate.error) return gate.error;

  const { id, conditionId } = await ctx.params;
  if (!id || !conditionId || id.length > 64 || conditionId.length > 64) {
    return NextResponse.json(
      { error: "Invalid id", code: "INVALID" },
      { status: 400 }
    );
  }

  const ip = clientIp(req);
  const rl = await rateLimit(
    `thesis-cond-del:${gate.user.id}:${ip}`,
    60,
    60_000
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many thesis changes. Try again shortly." },
      { status: 429, headers: rateLimitHeaders(rl, 60) }
    );
  }

  const result = await deleteConditionForUser(
    gate.user.id,
    id,
    conditionId
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: 404 }
    );
  }

  return NextResponse.json({
    thesis: result.thesis,
    conditionId: result.conditionId,
  });
}
