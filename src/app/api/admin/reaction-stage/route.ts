import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-guard";
import { getReactionStageCalibrationReport } from "@/lib/reaction-stage/calibration";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const hoursRaw = Number(req.nextUrl.searchParams.get("hours") ?? "168");
  const hours = ([24, 72, 168, 336, 720] as const).includes(hoursRaw as 168)
    ? (hoursRaw as 24 | 72 | 168 | 336 | 720)
    : 168;

  const report = await getReactionStageCalibrationReport(hours);
  return NextResponse.json(report);
}
