import { NextRequest, NextResponse } from "next/server";
import { authorizeCron, cronUnauthorized } from "@/lib/api-guard";
import { cronDeadlineMs } from "@/lib/cron-runtime";
import { runMetricsCompanyfactsCron } from "@/lib/metrics/cron";
import { noteCronFail, noteCronOk } from "@/lib/ops";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Incremental companyfacts → MetricObservation.
 * Serverless-safe: bounded batch, concurrency, deadline, checkpoint cursor.
 * Optional provider misses skip the symbol — do not fail the job.
 */
async function handle(req: NextRequest) {
  if (!authorizeCron(req)) return cronUnauthorized();
  try {
    const result = await runMetricsCompanyfactsCron({
      limit: 8,
      concurrency: 2,
      deadlineMs: cronDeadlineMs(60, 10),
    });
    noteCronOk("cron_metrics_ok", {
      upserted: result.upserted,
      failed: result.failed,
    });
    return NextResponse.json({
      ok: true,
      ...result,
      version: "metrics-companyfacts-v1",
    });
  } catch (error) {
    noteCronFail("metrics", error);
    return NextResponse.json(
      { ok: false, error: "Metrics ingest failed" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
