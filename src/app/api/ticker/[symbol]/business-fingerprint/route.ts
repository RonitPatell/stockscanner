/**
 * GET /api/ticker/[symbol]/business-fingerprint
 */

import { NextRequest, NextResponse } from "next/server";
import { getBusinessChangeFingerprintForSymbol } from "@/lib/company-state/fingerprint";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ symbol: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { symbol: raw } = await ctx.params;
  const symbol = (raw ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5);
  if (!symbol) {
    return NextResponse.json({ error: "Invalid symbol", code: "INVALID" }, { status: 400 });
  }
  try {
    const fingerprint = await getBusinessChangeFingerprintForSymbol(symbol);
    return NextResponse.json({ fingerprint });
  } catch {
    return NextResponse.json(
      { error: "Could not load business fingerprint", code: "ERROR" },
      { status: 500 }
    );
  }
}
