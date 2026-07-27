import { NextRequest, NextResponse } from "next/server";
import { authorizeCron, cronUnauthorized } from "@/lib/api-guard";
import { runPriorityTierTick } from "@/lib/ingest-pipeline";
import type { IngestTier } from "@/lib/ingest/types";
import { isScaleMode } from "@/lib/redis";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseTier(raw: string | null): IngestTier | null {
  const n = Number(raw);
  if (n === 0 || n === 1 || n === 2 || n === 3) return n;
  return null;
}

/**
 * Per-tier priority ingest tick — used by the always-on worker.
 * Does not claim a fixed 2s cadence; the worker supplies adaptive schedules.
 */
async function handle(req: NextRequest) {
  if (!authorizeCron(req)) return cronUnauthorized();

  const tier = parseTier(req.nextUrl.searchParams.get("tier"));
  if (tier == null) {
    return NextResponse.json(
      { ok: false, error: "tier query must be 0, 1, 2, or 3" },
      { status: 400 }
    );
  }

  try {
    const result = await runPriorityTierTick(tier);
    return NextResponse.json({
      ok: true,
      kind: "tier",
      scaleMode: isScaleMode(),
      ...result,
    });
  } catch (error) {
    console.error("tier ingest error:", error);
    return NextResponse.json(
      { ok: false, error: "Tier ingest failed" },
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
