import { NextResponse } from "next/server";
import { getPublicCaseStudies } from "@/lib/calibration/service";
import { CALIBRATION_DISCLAIMER } from "@/lib/calibration/types";

export const dynamic = "force-dynamic";

/** Public, approved, auditable case studies only — no private user data. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(40, Number(url.searchParams.get("limit") || 24));
  const items = await getPublicCaseStudies(limit);
  return NextResponse.json({
    items,
    count: items.length,
    disclaimer: CALIBRATION_DISCLAIMER,
    generatedAt: new Date().toISOString(),
  });
}
