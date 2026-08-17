import { NextRequest, NextResponse } from "next/server";
import { getInsiderReportForSymbol } from "@/lib/insider/get-report";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ symbol: string }> };

/**
 * GET /api/ticker/[symbol]/insiders
 * Shared Form 4 structured facts — no private user data.
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
    const report = await getInsiderReportForSymbol(symbol);
    return NextResponse.json({ report });
  } catch {
    return NextResponse.json(
      { error: "Could not load insider transactions", code: "ERROR" },
      { status: 500 }
    );
  }
}
