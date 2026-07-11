import { NextResponse } from "next/server";
import { getSpeedEdgeSummary } from "@/lib/speed-edge";
import { getIngestLatencyStats } from "@/lib/speed-wins";

export const dynamic = "force-dynamic";

/** Paper speed-edge ledger — proves Pro can pay for itself (illustrative). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(20, Number(url.searchParams.get("limit") || 10));
  const hours = Math.min(168, Number(url.searchParams.get("hours") || 72));

  const [edge, latency] = await Promise.all([
    getSpeedEdgeSummary(limit, hours),
    getIngestLatencyStats(24),
  ]);

  return NextResponse.json({
    ...edge,
    under3mRate: latency.under3mRate ?? edge.under3mRate,
    liveSampleSize: latency.sampleSize,
  });
}
