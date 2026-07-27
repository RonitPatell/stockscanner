import { NextRequest, NextResponse } from "next/server";
import { authorizeCron, cronUnauthorized } from "@/lib/api-guard";
import { drainAllQueues } from "@/lib/alert-backbone/worker";
import { runSyntheticProbe } from "@/lib/alert-backbone/probes";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) return cronUnauthorized();

  const probe = req.nextUrl.searchParams.get("probe") === "1";
  const [queues, probeResult] = await Promise.all([
    drainAllQueues({ maxJobsPerQueue: 40 }),
    probe ? runSyntheticProbe() : Promise.resolve(null),
  ]);

  return NextResponse.json({
    ok: true,
    queues,
    probe: probeResult,
    disclaimer:
      "Queue drain + optional synthetic probe. Metrics are not production SLO claims.",
  });
}
