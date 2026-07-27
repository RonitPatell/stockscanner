import { NextResponse } from "next/server";
import { authorizeCron, cronUnauthorized } from "@/lib/api-guard";
import { refreshSymbolMaster } from "@/lib/coverage/symbol-master";
import {
  ensureCuratedCoreCoverage,
  expireStaleCoverage,
} from "@/lib/coverage/coverage-service";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function handle(req: Request) {
  if (!authorizeCron(req)) return cronUnauthorized();
  try {
    const master = await refreshSymbolMaster();
    await ensureCuratedCoreCoverage();
    const expired = await expireStaleCoverage();
    return NextResponse.json({
      ok: true,
      symbolMaster: master,
      expiredCoverage: expired,
    });
  } catch (error) {
    console.error("coverage refresh failed:", error);
    return NextResponse.json({ ok: false, error: "Coverage refresh failed" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
