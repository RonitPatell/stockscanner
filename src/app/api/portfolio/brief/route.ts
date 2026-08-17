import { NextRequest, NextResponse } from "next/server";
import { requireTrustTickerAccess } from "@/lib/api-guard";
import { buildPortfolioBrief } from "@/lib/portfolio-brief";
import { trackRetention } from "@/lib/analytics/retention";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/portfolio/brief
 * Personalized Portfolio Brief for the session user.
 * Never accepts client userId.
 */
export async function GET(req: NextRequest) {
  const gate = await requireTrustTickerAccess();
  if (gate.error) return gate.error;

  const rl = await rateLimit(
    `portfolio-brief:${gate.user.id}`,
    30,
    60_000,
    { strict: true }
  );
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests", code: "RATE_LIMIT" },
      { status: 429 }
    );
  }

  const daysRaw = req.nextUrl.searchParams.get("days");
  let windowDays = 7;
  if (daysRaw) {
    const n = Number(daysRaw);
    if (Number.isFinite(n) && n >= 1 && n <= 30) windowDays = Math.floor(n);
  }

  try {
    const brief = await buildPortfolioBrief(gate.user.id, { windowDays });
    void trackRetention("portfolio_brief_opened", { userId: gate.user.id });
    return NextResponse.json({ brief });
  } catch {
    return NextResponse.json(
      { error: "Could not build Portfolio Brief", code: "ERROR" },
      { status: 500 }
    );
  }
}
