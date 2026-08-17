import { NextRequest, NextResponse } from "next/server";
import { getInstitution13fReport } from "@/lib/institutional/get-report";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ cik: string }> };

/**
 * GET /api/institution/[cik]/13f
 * Precomputed institutional filings summary — no live SEC fetch.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { cik: raw } = await ctx.params;
  const cik = (raw ?? "").replace(/\D/g, "").slice(0, 10);
  if (!cik) {
    return NextResponse.json(
      { error: "Invalid CIK", code: "INVALID" },
      { status: 400 }
    );
  }

  try {
    const report = await getInstitution13fReport(cik);
    return NextResponse.json({ report });
  } catch {
    return NextResponse.json(
      { error: "Could not load institutional filings", code: "ERROR" },
      { status: 500 }
    );
  }
}
