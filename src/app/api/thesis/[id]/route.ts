import { NextRequest, NextResponse } from "next/server";
import { requireTrustTickerAccess } from "@/lib/api-guard";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import {
  deleteThesisForUser,
  getThesisForUser,
  updateThesisBodySchema,
  updateThesisForUser,
  zodErrorMessage,
} from "@/lib/thesis";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET/PATCH/DELETE /api/thesis/[id]
 * Ownership always session.user.id — never client userId.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const gate = await requireTrustTickerAccess();
  if (gate.error) return gate.error;

  const { id } = await ctx.params;
  if (!id || id.length > 64) {
    return NextResponse.json(
      { error: "Invalid thesis id", code: "INVALID" },
      { status: 400 }
    );
  }

  const result = await getThesisForUser(gate.user.id, id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: 404 }
    );
  }
  return NextResponse.json({ thesis: result.thesis });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
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
  const rl = await rateLimit(`thesis-patch:${gate.user.id}:${ip}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many thesis changes. Try again shortly." },
      { status: 429, headers: rateLimitHeaders(rl, 60) }
    );
  }

  const raw = await req.json().catch(() => null);
  const parsed = updateThesisBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: zodErrorMessage(parsed.error), code: "INVALID" },
      { status: 400 }
    );
  }

  const result = await updateThesisForUser(gate.user.id, id, parsed.data);
  if (!result.ok) {
    const status = result.code === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status }
    );
  }
  return NextResponse.json({ thesis: result.thesis });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
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
  const rl = await rateLimit(`thesis-del:${gate.user.id}:${ip}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many thesis changes. Try again shortly." },
      { status: 429, headers: rateLimitHeaders(rl, 60) }
    );
  }

  const result = await deleteThesisForUser(gate.user.id, id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true });
}
