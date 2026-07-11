import { NextResponse } from "next/server";
import { getCatalystReplay } from "@/lib/catalyst-replay";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const hours = Math.min(48, Number(url.searchParams.get("hours") || 12));
  const limit = Math.min(120, Number(url.searchParams.get("limit") || 80));
  const replay = await getCatalystReplay(hours, limit);
  return NextResponse.json(replay);
}
