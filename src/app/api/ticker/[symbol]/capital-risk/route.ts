import { NextRequest, NextResponse } from "next/server";
import { getCapitalRiskReportForSymbol } from "@/lib/capital-risk/snapshot";
import { getDilutionTimeline } from "@/lib/dilution/timeline";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ symbol: string }> };

/**
 * GET /api/ticker/[symbol]/capital-risk
 * Shared capital facts — no private user data.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { symbol: raw } = await ctx.params;
  const symbol = (raw ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5);
  if (!symbol) {
    return NextResponse.json(
      { error: "Invalid symbol", code: "INVALID" },
      { status: 400 }
    );
  }

  try {
    const [report, timeline] = await Promise.all([
      getCapitalRiskReportForSymbol(symbol),
      getDilutionTimeline(symbol, 40),
    ]);
    return NextResponse.json({ report, timeline });
  } catch {
    return NextResponse.json(
      { error: "Could not load capital risk", code: "ERROR" },
      { status: 500 }
    );
  }
}
