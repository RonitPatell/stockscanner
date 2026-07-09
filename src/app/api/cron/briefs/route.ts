import { NextRequest, NextResponse } from "next/server";
import { dispatchDailyBriefs } from "@/lib/brief-dispatch";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorize(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV === "development";
  return authHeader === `Bearer ${secret}`;
}

/** Morning brief ~7:30 ET · EOD recap ~4:15 ET — pass ?kind=morning|eod */
export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
