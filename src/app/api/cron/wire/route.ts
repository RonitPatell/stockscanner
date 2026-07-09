import { NextRequest, NextResponse } from "next/server";
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

function authorize(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV === "development";
  return authHeader === `Bearer ${secret}`;
}

async function handleWireCron(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
      console.error("Cron wire error:", error);
      markWireFailed("Wire ingest failed");
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
