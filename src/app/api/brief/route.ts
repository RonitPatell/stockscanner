import { NextRequest, NextResponse } from "next/server";
import { requireTrustTickerAccess } from "@/lib/api-guard";
import { buildWatchlistBrief, markBriefSeen } from "@/lib/briefs";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireTrustTickerAccess();
  if (gate.error) return gate.error;

  const kindRaw = req.nextUrl.searchParams.get("kind") ?? "delta";
  const kind =
    kindRaw === "morning" || kindRaw === "eod" || kindRaw === "delta"
      ? kindRaw
      : "delta";

  const brief = await buildWatchlistBrief(gate.user.id, kind);
  if (!brief) {
    return NextResponse.json({ error: "Empty watchlist" }, { status: 400 });
  }

  return NextResponse.json(brief);
}

export async function POST() {
  const gate = await requireTrustTickerAccess();
  if (gate.error) return gate.error;

  await markBriefSeen(gate.user.id);
  return NextResponse.json({ ok: true });
}
