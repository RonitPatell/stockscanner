import { NextResponse } from "next/server";
import { requirePro } from "@/lib/api-guard";
import { getSympathyMap, getTopSympathyHubs } from "@/lib/sympathy-map";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await requirePro();
  if (gate.error) return gate.error;

  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol")?.trim().toUpperCase();
  const hours = Math.min(168, Number(url.searchParams.get("hours") || 48));
  const limit = Math.min(20, Number(url.searchParams.get("limit") || 10));

  if (symbol) {
    const map = await getSympathyMap(symbol, hours, limit);
    return NextResponse.json(map);
  }

  const hubs = await getTopSympathyHubs(hours, limit);
  return NextResponse.json({
    hubs,
    generatedAt: new Date().toISOString(),
    hours,
  });
}
