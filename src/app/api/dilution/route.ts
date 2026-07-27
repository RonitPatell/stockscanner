import { NextResponse } from "next/server";
import { requirePro } from "@/lib/api-guard";
import { getDilutionRadar, getDilutionTimeline } from "@/lib/dilution-radar";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await requirePro();
  if (gate.error) return gate.error;

  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol")?.trim().toUpperCase();
  const limit = Math.min(30, Number(url.searchParams.get("limit") || 12));
  const hours = Math.min(168, Number(url.searchParams.get("hours") || 48));

  if (symbol) {
    const timeline = await getDilutionTimeline(symbol, Math.min(80, limit * 4));
    return NextResponse.json({
      symbol,
      timeline,
      count: timeline.length,
      version: "dilution-radar-v2",
      generatedAt: new Date().toISOString(),
    });
  }

  const items = await getDilutionRadar(limit, hours);
  return NextResponse.json({
    items,
    count: items.length,
    version: "dilution-radar-v2",
    generatedAt: new Date().toISOString(),
  });
}
