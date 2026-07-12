import { NextResponse } from "next/server";
import { requirePro } from "@/lib/api-guard";
import { getDilutionRadar } from "@/lib/dilution-radar";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await requirePro();
  if (gate.error) return gate.error;

  const url = new URL(req.url);
  const limit = Math.min(30, Number(url.searchParams.get("limit") || 12));
  const hours = Math.min(168, Number(url.searchParams.get("hours") || 48));
  const items = await getDilutionRadar(limit, hours);
  return NextResponse.json({
    items,
    count: items.length,
    generatedAt: new Date().toISOString(),
  });
}
