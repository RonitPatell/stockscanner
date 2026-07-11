import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCachedQuotes } from "@/lib/quote-cache-service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const hours = Math.min(72, Number(url.searchParams.get("hours") || 24));
  const limit = Math.min(40, Number(url.searchParams.get("limit") || 20));
  const watchlistOnly = url.searchParams.get("watchlist") === "1";
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  let symbolFilter: string[] | undefined;
  if (watchlistOnly) {
    const session = await auth();
    if (session?.user?.id) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { watchlist: true },
      });
      symbolFilter = (user?.watchlist ?? []).map((s) => s.toUpperCase());
    } else {
      symbolFilter = [];
    }
  }

  if (watchlistOnly && symbolFilter && symbolFilter.length === 0) {
    return NextResponse.json({
      calls: [],
      watchlistOnly: true,
      generatedAt: new Date().toISOString(),
    });
  }

  const calls = await prisma.traderCall.findMany({
    where: {
      createdAt: { gte: since },
      ...(symbolFilter?.length ? { symbol: { in: symbolFilter } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const symbols = [...new Set(calls.map((c) => c.symbol))];
  const quotes = symbols.length ? await getCachedQuotes(symbols) : {};

  return NextResponse.json({
    calls: calls.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      liveChangePercent: quotes[c.symbol]?.changePercent ?? null,
      livePrice: quotes[c.symbol]?.price ?? null,
    })),
    watchlistOnly,
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  const body = await req.json().catch(() => ({}));
  const symbol = String(body.symbol ?? "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 5);
  const bias = ["long", "short", "avoid", "watch"].includes(body.bias)
    ? body.bias
    : "watch";
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  let displayName = String(body.displayName ?? "Trader").slice(0, 32);
  if (session?.user?.name) displayName = session.user.name.split(" ")[0] ?? displayName;
  else if (session?.user?.email) displayName = session.user.email.split("@")[0] ?? displayName;

  const quotes = await getCachedQuotes([symbol]);
  const q = quotes[symbol];

  const call = await prisma.traderCall.create({
    data: {
      userId: session?.user?.id ?? null,
      displayName,
      symbol,
      bias,
      headline: body.headline ? String(body.headline).slice(0, 200) : null,
      note: body.note ? String(body.note).slice(0, 280) : null,
      priceAtCall: q?.price ?? (body.price != null ? Number(body.price) : null),
      changeAtCall: q?.changePercent ?? null,
    },
  });

  return NextResponse.json({ call, ok: true });
}
