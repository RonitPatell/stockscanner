/**
 * GET /api/ticker/[symbol]/company-state
 * Deterministic Company State — DB read models only.
 */

import { NextRequest, NextResponse } from "next/server";
import { buildCompanyStateReport } from "@/lib/company-state";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ symbol: string }> };

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
    const report = await buildCompanyStateReport(symbol);
    return NextResponse.json({ report });
  } catch {
    return NextResponse.json(
      { error: "Could not load company state", code: "ERROR" },
      { status: 500 }
    );
  }
}
