import { NextRequest, NextResponse } from "next/server";
import { dispatchTrialDrip } from "@/lib/trial-drip";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorize(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV === "development";
  return authHeader === `Bearer ${secret}`;
}

/** Trial habit drip — days 1–6 for trialing subscribers */
export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await dispatchTrialDrip();
  return NextResponse.json({ ok: true, ...result, finishedAt: new Date().toISOString() });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
