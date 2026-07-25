import { NextRequest, NextResponse } from "next/server";
import { authorizeCron, cronUnauthorized } from "@/lib/api-guard";
import { runIngestPipeline } from "@/lib/ingest-pipeline";
import { isScaleMode } from "@/lib/redis";
import {
  getSystemHealth,
  markPipelineStarted,
  markPipelineFinished,
  markPipelineFailed,
  isPipelineInFlight,
  setAvgIngestDelaySec,
} from "@/lib/system-health";
import { computeAvgIngestDelaySec } from "@/lib/playbooks";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Background ingest + feed cache refresh — single writer for all users. */
async function handleCron(req: NextRequest) {
  if (!authorizeCron(req)) return cronUnauthorized();

  if (isPipelineInFlight()) {
    return NextResponse.json({
      ok: true,
      status: "already_running",
      ...getSystemHealth(isScaleMode()),
    });
  }

  markPipelineStarted();
  void runIngestPipeline()
    .then((result) => {
      markPipelineFinished({ ok: true, scaleMode: isScaleMode(), ...result });
      void computeAvgIngestDelaySec()
        .then((delay) => setAvgIngestDelaySec(delay))
        .catch(() => {});
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : "Ingest failed";
      console.error("Cron ingest error:", error);
      markPipelineFailed(message);
    });

  return NextResponse.json({
    ok: true,
    status: "started",
    scaleMode: isScaleMode(),
    startedAt: new Date().toISOString(),
  });
}

export async function GET(req: NextRequest) {
  return handleCron(req);
}

export async function POST(req: NextRequest) {
  return handleCron(req);
}
