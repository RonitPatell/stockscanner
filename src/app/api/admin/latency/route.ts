import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-guard";
import { getAdminLatencyDashboard } from "@/lib/latency-trace";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const hoursRaw = Number(req.nextUrl.searchParams.get("hours") ?? "24");
  const hours = ([1, 6, 24, 72, 168] as const).includes(hoursRaw as 24)
    ? (hoursRaw as 1 | 6 | 24 | 72 | 168)
    : 24;

  const dashboard = await getAdminLatencyDashboard({ hours });
  return NextResponse.json(dashboard);
}
