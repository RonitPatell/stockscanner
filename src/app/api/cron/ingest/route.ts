import { NextRequest, NextResponse } from "next/server";
import { runIngestPipeline } from "@/lib/ingest-pipeline";
import { isScaleMode } from "@/lib/redis";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorize(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV === "development";
  return authHeader === `Bearer ${secret}`;
}

/** Background ingest + feed cache refresh — single writer for all users. */
async function handleCron(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runIngestPipeline();
    return NextResponse.json({ ok: true, scaleMode: isScaleMode(), ...result });
  } catch (error) {
    console.error("Cron ingest error:", error);
    return NextResponse.json({ error: "Ingest failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handleCron(req);
}

export async function POST(req: NextRequest) {
  return handleCron(req);
}
