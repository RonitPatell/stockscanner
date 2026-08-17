import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { buildResearchOverview } from "@/lib/research/overview";
import { resolveWhatChangedAccess } from "@/lib/ticker-what-changed";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ symbol: string }> };

/**
 * GET /api/research/[symbol]/overview
 * Factual Research Overview. Thesis health only when entitled session owns thesis.
 * Never returns thesis notes/premises. Never accepts client userId.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { symbol: raw } = await ctx.params;
  const symbol = (raw ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5);
  if (!symbol) {
    return NextResponse.json(
      { error: "Invalid symbol", code: "INVALID" },
      { status: 400 }
    );
  }

  const ip = clientIp(req);
  const rl = await rateLimit(`research:overview:${ip}`, 40, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(rl, 40) }
    );
  }

  const session = await auth();
  const access = await resolveWhatChangedAccess({
    userId: session?.user?.id ?? null,
  });

  try {
    const overview = await buildResearchOverview({
      symbol,
      accessMode: access.accessMode,
      userId: access.userId,
    });
    // Defense: never leak private fields if somehow attached
    if (overview.meta.accessMode === "public") {
      overview.monitoring = null;
      overview.thesis = null;
    }
    return NextResponse.json({ overview });
  } catch {
    return NextResponse.json(
      { error: "Could not load research overview", code: "ERROR" },
      { status: 500 }
    );
  }
}
