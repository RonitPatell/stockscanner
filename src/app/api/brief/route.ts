import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { buildWatchlistBrief, markBriefSeen } from "@/lib/briefs";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const kind = (req.nextUrl.searchParams.get("kind") ?? "delta") as
    | "morning"
    | "eod"
    | "delta";

  const brief = await buildWatchlistBrief(session.user.id, kind);
  if (!brief) {
    return NextResponse.json({ error: "Empty watchlist" }, { status: 400 });
  }

  return NextResponse.json(brief);
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await markBriefSeen(session.user.id);
  return NextResponse.json({ ok: true });
}
