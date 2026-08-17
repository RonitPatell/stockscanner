import { NextRequest, NextResponse } from "next/server";
import { getOwnershipReportForSymbol } from "@/lib/ownership/get-report";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ symbol: string }> };

/**
 * GET /api/ticker/[symbol]/ownership
 * Shared 13D/13G structured facts — no private user data.
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
    const report = await getOwnershipReportForSymbol(symbol);
    return NextResponse.json({ report });
  } catch {
    return NextResponse.json(
      { error: "Could not load ownership filings", code: "ERROR" },
      { status: 500 }
    );
  }
}
