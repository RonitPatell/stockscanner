import { NextResponse } from "next/server";
import { requirePro } from "@/lib/api-guard";
import {
  getCalibrationDashboardSummary,
  getCalibrationReport,
} from "@/lib/calibration/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await requirePro();
  if (gate.error) return gate.error;

  const url = new URL(req.url);
  const hours = Math.min(720, Number(url.searchParams.get("hours") || 24));
  const full = url.searchParams.get("full") === "1";

  if (full) {
    const report = await getCalibrationReport({ hours, publicOnly: false });
    return NextResponse.json(report);
  }

  const summary = await getCalibrationDashboardSummary(hours);
  return NextResponse.json(summary);
}
