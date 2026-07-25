import { NextRequest, NextResponse } from "next/server";
import { authorizeCron, cronUnauthorized } from "@/lib/api-guard";
import { runWirePipeline } from "@/lib/ingest-pipeline";
import { isScaleMode } from "@/lib/redis";
import {
  getSystemHealth,
  markWireStarted,
  markWireFinished,
  markWireFailed,
  isWireInFlight,
} from "@/lib/system-health";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handleWireCron(req: NextRequest) {
  if (!authorizeCron(req)) return cronUnauthorized();

  if (isWireInFlight()) {
    return NextResponse.json({
      ok: true,
      status: "already_running",
      ...getSystemHealth(isScaleMode()),
    });
  }

  markWireStarted();
  void runWirePipeline()
    .then((result) => {
      markWireFinished({ ok: true, scaleMode: isScaleMode(), ...result });
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : "Wire ingest failed";
      console.error("Cron wire error:", error);
      markWireFailed(message);
    });

  return NextResponse.json({
    ok: true,
    status: "started",
    kind: "wire",
    scaleMode: isScaleMode(),
    startedAt: new Date().toISOString(),
  });
}

export async function GET(req: NextRequest) {
  return handleWireCron(req);
}

export async function POST(req: NextRequest) {
  return handleWireCron(req);
}
