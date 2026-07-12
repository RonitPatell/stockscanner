import { NextRequest, NextResponse } from "next/server";
import { authorizeCron, cronUnauthorized } from "@/lib/api-guard";
import { dispatchTrialDrip } from "@/lib/trial-drip";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Trial habit drip — days 1–6 for trialing subscribers */
export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) return cronUnauthorized();
  const result = await dispatchTrialDrip();
  return NextResponse.json({ ok: true, ...result, finishedAt: new Date().toISOString() });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
