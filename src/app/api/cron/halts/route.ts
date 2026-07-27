import { NextRequest, NextResponse } from "next/server";
import { authorizeCron, cronUnauthorized } from "@/lib/api-guard";
import { pollHaltProviders } from "@/lib/halt-monitor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) return cronUnauthorized();

  const result = await pollHaltProviders();
  return NextResponse.json({
    ok: true,
    ...result,
    note: "Official resume times only when the exchange publishes them. Missing HALT_OFFICIAL_URL yields empty polls.",
  });
}
