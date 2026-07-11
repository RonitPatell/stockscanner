import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getWatchlistAutopsy } from "@/lib/watchlist-autopsy";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const hours = Math.min(72, Number(url.searchParams.get("hours") || 24));
  const limit = Math.min(30, Number(url.searchParams.get("limit") || 12));

  const session = await auth();
  let watchlist: string[] = [];

  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { watchlist: true },
    });
    watchlist = user?.watchlist ?? [];
  }

  const raw = url.searchParams.get("symbols");
  if (raw) {
    watchlist = raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  }

  const autopsy = await getWatchlistAutopsy(watchlist, hours, limit);
  return NextResponse.json({ ...autopsy, generatedAt: new Date().toISOString() });
}
