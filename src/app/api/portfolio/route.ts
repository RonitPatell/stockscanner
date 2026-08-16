import { NextRequest, NextResponse } from "next/server";
import { requireTrustTickerAccess } from "@/lib/api-guard";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import {
  addPortfolioBodySchema,
  zodErrorMessage,
} from "@/lib/portfolio/schemas";
import {
  addPortfolioForUser,
  listPortfolioForUser,
} from "@/lib/portfolio/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireTrustTickerAccess();
  if (gate.error) return gate.error;

  const items = await listPortfolioForUser(gate.user.id);
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const gate = await requireTrustTickerAccess();
  if (gate.error) return gate.error;

  const ip = clientIp(req);
  const rl = await rateLimit(`portfolio-add:${gate.user.id}:${ip}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many portfolio changes. Try again shortly." },
      { status: 429, headers: rateLimitHeaders(rl, 30) }
    );
  }

  const raw = await req.json().catch(() => null);
  const parsed = addPortfolioBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: zodErrorMessage(parsed.error), code: "INVALID" },
      { status: 400 }
    );
  }

  const result = await addPortfolioForUser(gate.user.id, parsed.data);
  if (!result.ok) {
    const status = result.code === "DUPLICATE" ? 409 : 400;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status }
    );
  }

  return NextResponse.json({ item: result.item }, { status: 201 });
}
