import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getCompanyWhatChangedFeed,
  isWhatChangedWindow,
  resolveWhatChangedAccess,
  type WhatChangedWindow,
} from "@/lib/ticker-what-changed";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ symbol: string }> };

/**
 * GET /api/ticker/[symbol]/what-changed
 *
 * Public: limited factual preview (no thesis).
 * Entitled session: full feed + thesis relevance overlay.
 * Never accepts client userId for ownership.
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { symbol: raw } = await ctx.params;
  const symbol = (raw ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5);
  if (!symbol) {
    return NextResponse.json(
      { error: "Invalid symbol", code: "INVALID" },
      { status: 400 }
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const rl = await rateLimit(`what-changed:${ip}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests", code: "RATE_LIMIT" },
      { status: 429 }
    );
  }

  const sp = req.nextUrl.searchParams;
  const windowRaw = sp.get("window") ?? "30d";
  const window: WhatChangedWindow = isWhatChangedWindow(windowRaw)
    ? windowRaw
    : "30d";
  const showAllActivity =
    sp.get("showAll") === "1" ||
    sp.get("showAll") === "true" ||
    sp.get("showAllActivity") === "1";
  const lastViewIso = sp.get("since") || sp.get("lastView") || null;

  const session = await auth();
  const access = await resolveWhatChangedAccess({
    userId: session?.user?.id ?? null,
  });

  try {
    const feed = await getCompanyWhatChangedFeed({
      symbol,
      window,
      showAllActivity,
      lastViewIso,
      accessMode: access.accessMode,
      userId: access.userId,
    });

    // Defense: strip thesis on public responses
    if (access.accessMode === "public") {
      for (const c of feed.cards) c.thesisRelevance = null;
      feed.meta.hasThesis = false;
      feed.meta.accessMode = "public";
    }

    return NextResponse.json({ feed });
  } catch {
    return NextResponse.json(
      { error: "Could not load What Changed", code: "ERROR" },
      { status: 500 }
    );
  }
}
