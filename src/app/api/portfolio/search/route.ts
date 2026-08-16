import { NextRequest, NextResponse } from "next/server";
import { requireTrustTickerAccess } from "@/lib/api-guard";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import {
  portfolioSearchQuerySchema,
  zodErrorMessage,
} from "@/lib/portfolio/schemas";
import { searchCompaniesForPortfolio } from "@/lib/portfolio/service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireTrustTickerAccess();
  if (gate.error) return gate.error;

  const ip = clientIp(req);
  const rl = await rateLimit(`portfolio-search:${gate.user.id}:${ip}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many searches. Try again shortly." },
      { status: 429, headers: rateLimitHeaders(rl, 60) }
    );
  }

  const parsed = portfolioSearchQuerySchema.safeParse({
    q: req.nextUrl.searchParams.get("q") ?? "",
    limit: req.nextUrl.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: zodErrorMessage(parsed.error), code: "INVALID" },
      { status: 400 }
    );
  }

  const results = await searchCompaniesForPortfolio(parsed.data);
  return NextResponse.json({ results });
}
