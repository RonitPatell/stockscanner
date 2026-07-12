import { NextResponse } from "next/server";
import { requirePro } from "@/lib/api-guard";
import { isScaleMode } from "@/lib/redis";

export const dynamic = "force-dynamic";

/** Legacy client kick — in scale mode ingest is cron-only. */
export async function POST() {
  const gate = await requirePro();
  if (gate.error) return gate.error;

  if (isScaleMode()) {
    return NextResponse.json({
      ok: true,
      status: "scale_mode",
      message: "Ingest runs via /api/cron/ingest on a schedule",
    });
  }

  return NextResponse.json({
    ok: true,
    status: "dev_mode",
    message: "Local ingest loop handles refresh in development",
  });
}
