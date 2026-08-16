import { NextRequest, NextResponse } from "next/server";
import { requireTrustTickerAccess } from "@/lib/api-guard";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import {
  updatePortfolioBodySchema,
  zodErrorMessage,
} from "@/lib/portfolio/schemas";
import {
  removePortfolioForUser,
  updatePortfolioForUser,
} from "@/lib/portfolio/service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const gate = await requireTrustTickerAccess();
  if (gate.error) return gate.error;

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const ip = clientIp(req);
  const rl = await rateLimit(`portfolio-patch:${gate.user.id}:${ip}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many portfolio changes. Try again shortly." },
      { status: 429, headers: rateLimitHeaders(rl, 60) }
    );
  }

  const raw = await req.json().catch(() => null);
  const parsed = updatePortfolioBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: zodErrorMessage(parsed.error), code: "INVALID" },
      { status: 400 }
    );
  }

  // Never honor client userId — ownership is session only.
  const result = await updatePortfolioForUser(gate.user.id, id, parsed.data);
  if (!result.ok) {
    const status = result.code === "NOT_FOUND" ? 404 : 400;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status }
    );
  }

  return NextResponse.json({ item: result.item });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const gate = await requireTrustTickerAccess();
  if (gate.error) return gate.error;

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const ip = clientIp(req);
  const rl = await rateLimit(`portfolio-del:${gate.user.id}:${ip}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many portfolio changes. Try again shortly." },
      { status: 429, headers: rateLimitHeaders(rl, 60) }
    );
  }

  const result = await removePortfolioForUser(gate.user.id, id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, symbol: result.symbol });
}
