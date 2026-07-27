import { NextResponse } from "next/server";
import { authorizeCron, cronUnauthorized } from "@/lib/api-guard";
import { cleanupLatencyTraces } from "@/lib/latency-trace";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: Request) {
  if (!authorizeCron(req)) return cronUnauthorized();
  try {
    const result = await cleanupLatencyTraces();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("latency-trace cleanup failed:", error);
    return NextResponse.json({ ok: false, error: "Cleanup failed" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
