import { NextRequest, NextResponse } from "next/server";
import { getPublicLatencyProof } from "@/lib/latency-trace";

export const dynamic = "force-dynamic";

/**
 * Public sanitized latency proof — aggregate metrics only + selected examples.
 * Cohorts are never blended into a single speed claim.
 */
export async function GET(req: NextRequest) {
  const hoursRaw = Number(req.nextUrl.searchParams.get("hours") ?? "24");
  const hours = ([24, 72, 168] as const).includes(hoursRaw as 24)
    ? (hoursRaw as 24 | 72 | 168)
    : 24;

  const proof = await getPublicLatencyProof({ hours });
  return NextResponse.json(proof, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
    },
  });
}
