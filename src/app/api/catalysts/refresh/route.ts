import { NextResponse } from "next/server";
import { ingestWireBurst } from "@/lib/catalyst-engine";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

let refreshInFlight = false;

/** Kick off news ingest without blocking the UI. */
export async function POST() {
  // Immediately drop day-old items so the feed never re-shows them
  try {
    await prisma.catalyst.deleteMany({
      where: { publishedAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });
  } catch { /* ignore */ }

  if (refreshInFlight) {
    return NextResponse.json({ ok: true, status: "already_running" });
  }

  refreshInFlight = true;
  void ingestWireBurst()
    .catch((err) => console.error("Background ingest failed:", err))
    .finally(() => {
      refreshInFlight = false;
    });

  return NextResponse.json({
    ok: true,
    status: "started",
    refreshedAt: new Date().toISOString(),
  });
}
