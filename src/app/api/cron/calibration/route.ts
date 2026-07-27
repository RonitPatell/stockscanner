import { NextResponse } from "next/server";
import { authorizeCron, cronUnauthorized } from "@/lib/api-guard";
import { backfillCatalystOutcomes } from "@/lib/calibration/backfill";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: Request) {
  if (!authorizeCron(req)) return cronUnauthorized();
  try {
    const result = await backfillCatalystOutcomes({ limit: 20, maxAgeHours: 72 });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("calibration backfill failed:", error);
    return NextResponse.json(
      { ok: false, error: "Calibration backfill failed" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
