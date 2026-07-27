import { NextRequest, NextResponse } from "next/server";
import {
  getReliabilityDashboard,
  loadIncidentsFromDb,
  RELIABILITY_DISCLAIMER,
  STATUS_PAGE_LEGAL_PLACEHOLDER,
} from "@/lib/reliability";

export const dynamic = "force-dynamic";

/**
 * Public status page API — aggregated indicators + incident timeline.
 * Targets are never claimed achieved without production verification + samples.
 */
export async function GET(req: NextRequest) {
  const hoursRaw = Number(req.nextUrl.searchParams.get("hours") ?? "24");
  const hours = [24, 72, 168].includes(hoursRaw) ? hoursRaw : 24;

  try {
    const [dash, incidents] = await Promise.all([
      getReliabilityDashboard(hours),
      loadIncidentsFromDb().catch(() => []),
    ]);

    return NextResponse.json(
      {
        hours,
        overall: overallFrom(dash.indicators.map((i) => i.status)),
        indicators: dash.indicators.map((i) => ({
          id: i.id,
          name: i.name,
          definition: i.definition,
          unit: i.unit,
          measured: i.measured,
          target: i.target,
          sampleSize: i.sampleSize,
          status: i.status,
          achieved: i.achieved,
          note: i.note,
          latencyKind: i.latencyKind ?? null,
        })),
        sourceNotices: dash.sourceNotices,
        live: dash.live,
        publicLatency: dash.publicLatency,
        incidents: incidents.slice(0, 30).map((i) => ({
          id: i.id,
          title: i.title,
          summary: i.summary,
          severity: i.severity,
          status: i.status,
          startedAt: i.startedAt,
          endedAt: i.endedAt,
          announcedMaintenance: i.announcedMaintenance,
          sources: i.sources,
          components: i.components,
        })),
        disclaimer: RELIABILITY_DISCLAIMER,
        legalPlaceholder: STATUS_PAGE_LEGAL_PLACEHOLDER,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      }
    );
  } catch (e) {
    console.error("[status]", e);
    return NextResponse.json(
      {
        error: "Status temporarily unavailable",
        disclaimer: RELIABILITY_DISCLAIMER,
      },
      { status: 503 }
    );
  }
}

function overallFrom(
  statuses: string[]
): "operational" | "degraded" | "outage" | "insufficient_data" {
  if (statuses.includes("outage")) return "outage";
  if (statuses.includes("degraded")) return "degraded";
  if (statuses.every((s) => s === "insufficient_data")) return "insufficient_data";
  if (statuses.some((s) => s === "operational")) return "operational";
  return "insufficient_data";
}
