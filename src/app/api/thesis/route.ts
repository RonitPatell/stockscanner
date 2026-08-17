import { NextRequest, NextResponse } from "next/server";
import { requireTrustTickerAccess } from "@/lib/api-guard";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import {
  createThesisBodySchema,
  createThesisForUser,
  listThesesForUser,
  thesisListQuerySchema,
  zodErrorMessage,
} from "@/lib/thesis";

export const dynamic = "force-dynamic";

/**
 * GET /api/thesis — list private theses (optional ?symbol=&status=).
 * POST /api/thesis — create thesis for a symbol.
 * Entitlement: requireTrustTickerAccess. Never accepts client userId.
 */
export async function GET(req: NextRequest) {
  const gate = await requireTrustTickerAccess();
  if (gate.error) return gate.error;

  const sp = req.nextUrl.searchParams;
  const parsed = thesisListQuerySchema.safeParse({
    symbol: sp.get("symbol") ?? undefined,
    status: sp.get("status") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: zodErrorMessage(parsed.error), code: "INVALID" },
      { status: 400 }
    );
  }

  const theses = await listThesesForUser(gate.user.id, parsed.data);
  return NextResponse.json({ theses });
}

export async function POST(req: NextRequest) {
  const gate = await requireTrustTickerAccess();
  if (gate.error) return gate.error;

  const ip = clientIp(req);
  const rl = await rateLimit(`thesis-create:${gate.user.id}:${ip}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many thesis changes. Try again shortly." },
      { status: 429, headers: rateLimitHeaders(rl, 30) }
    );
  }

  const raw = await req.json().catch(() => null);
  const parsed = createThesisBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: zodErrorMessage(parsed.error), code: "INVALID" },
      { status: 400 }
    );
  }

  const result = await createThesisForUser(gate.user.id, parsed.data);
  if (!result.ok) {
    const status = result.code === "DUPLICATE" ? 409 : 400;
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status }
    );
  }

  return NextResponse.json({ thesis: result.thesis }, { status: 201 });
}
