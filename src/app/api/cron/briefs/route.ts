import { NextRequest, NextResponse } from "next/server";
import { authorizeCron, cronUnauthorized } from "@/lib/api-guard";
import { dispatchDailyBriefs } from "@/lib/brief-dispatch";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Morning brief ~7:30 ET · EOD recap ~4:15 ET — pass ?kind=morning|eod */
export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) return cronUnauthorized();

  const kind = req.nextUrl.searchParams.get("kind") === "eod" ? "eod" : "morning";
  const result = await dispatchDailyBriefs(kind);

  return NextResponse.json({
    ok: true,
    kind,
    ...result,
    finishedAt: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
