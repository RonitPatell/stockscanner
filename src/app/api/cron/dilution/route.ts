import { NextResponse } from "next/server";
import { authorizeCron, cronUnauthorized } from "@/lib/api-guard";
import { dispatchDilutionRiskAlerts } from "@/lib/dilution/risk-alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: Request) {
  if (!authorizeCron(req)) return cronUnauthorized();
  try {
    const sent = await dispatchDilutionRiskAlerts({ sinceHours: 8 });
    return NextResponse.json({
      ok: true,
      riskAlertsSent: sent,
      version: "dilution-radar-v2",
    });
  } catch (error) {
    console.error("dilution risk cron failed:", error);
    return NextResponse.json(
      { ok: false, error: "Dilution risk dispatch failed" },
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
