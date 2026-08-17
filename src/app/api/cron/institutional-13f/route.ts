import { NextResponse } from "next/server";
import { authorizeCron, cronUnauthorized } from "@/lib/api-guard";
import { runInstitutional13fCron } from "@/lib/institutional/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Background Form 13F ingest — SEC public filings only.
 * Never runs heavy 13F parse on user page requests.
 */
async function handle(req: Request) {
  if (!authorizeCron(req)) return cronUnauthorized();
  try {
    const result = await runInstitutional13fCron({ limit: 8, sinceHours: 96 });
    return NextResponse.json({
      ok: true,
      ...result,
      version: "institutional-13f-v1",
      note: "13F data is delayed; not real-time",
    });
  } catch (error) {
    console.error("institutional-13f cron failed:", error);
    return NextResponse.json(
      { ok: false, error: "Institutional 13F ingest failed" },
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
