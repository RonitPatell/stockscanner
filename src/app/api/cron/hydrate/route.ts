import { NextRequest, NextResponse } from "next/server";
import { authorizeCron, cronUnauthorized } from "@/lib/api-guard";
import { cronDeadlineMs } from "@/lib/cron-runtime";
import { noteCronFail, noteCronOk } from "@/lib/ops";
import {
  productionHydratePorts,
  runHydrationCron,
} from "@/lib/company-readiness";
import { createPrismaHydrationJobStore } from "@/lib/company-readiness/prisma-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: NextRequest) {
  if (!authorizeCron(req)) return cronUnauthorized();
  try {
    const result = await runHydrationCron({
      jobs: createPrismaHydrationJobStore(),
      hydratePorts: productionHydratePorts(),
      limit: 2,
      concurrency: 1,
      deadlineMs: cronDeadlineMs(60, 10),
    });
    noteCronOk("cron_hydrate_ok", result);
    return NextResponse.json({ ok: true, ...result, version: "company-hydrate-v1" });
  } catch (error) {
    noteCronFail("hydrate", error);
    return NextResponse.json(
      { ok: false, error: "Company hydration failed" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
