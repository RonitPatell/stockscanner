import { NextResponse } from "next/server";
import { requirePro } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { getCachedQuotes } from "@/lib/quote-cache-service";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await requirePro();
  if (gate.error) return gate.error;

  const url = new URL(req.url);
  const hours = Math.min(72, Number(url.searchParams.get("hours") || 24));
  const limit = Math.min(40, Number(url.searchParams.get("limit") || 20));
  const watchlistOnly = url.searchParams.get("watchlist") === "1";
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  let symbolFilter: string[] | undefined;
  if (watchlistOnly) {
    const user = await prisma.user.findUnique({
      where: { id: gate.user.id },
      select: { watchlist: true },
    });
    symbolFilter = (user?.watchlist ?? []).map((s) => s.toUpperCase());
    if (symbolFilter.length === 0) {
      return NextResponse.json({
        calls: [],
        watchlistOnly: true,
        generatedAt: new Date().toISOString(),
      });
    }
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
      id: c.id,
      symbol: c.symbol,
      bias: c.bias,
      note: c.note,
      displayName: c.displayName,
      createdAt: c.createdAt.toISOString(),
      liveChangePercent: quotes[c.symbol]?.changePercent ?? null,
      livePrice: quotes[c.symbol]?.price ?? null,
    })),
    watchlistOnly,
    generatedAt: new Date().toISOString(),
  });
}

export async function POST(req: Request) {
  const gate = await requirePro();
  if (gate.error) return gate.error;

  const ip = clientIp(req);
  const rl = await rateLimit(`calls:post:${gate.user.id}:${ip}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many calls — slow down" },
      { status: 429, headers: rateLimitHeaders(rl, 20) }
    );
  }

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

  const user = await prisma.user.findUnique({
    where: { id: gate.user.id },
    select: { name: true, email: true },
  });
  let displayName = String(body.displayName ?? "Trader").slice(0, 32);
  if (user?.name) displayName = user.name.split(" ")[0] ?? displayName;
  else if (user?.email) displayName = user.email.split("@")[0] ?? displayName;

  const quotes = await getCachedQuotes([symbol]);
  const q = quotes[symbol];

  const call = await prisma.traderCall.create({
    data: {
      userId: gate.user.id,
      displayName,
      symbol,
      bias,
      headline: body.headline ? String(body.headline).slice(0, 200) : null,
      note: body.note ? String(body.note).slice(0, 280) : null,
      priceAtCall: q?.price ?? (body.price != null ? Number(body.price) : null),
      changeAtCall: q?.changePercent ?? null,
    },
  });

  return NextResponse.json({
    ok: true,
    call: {
      id: call.id,
      symbol: call.symbol,
      bias: call.bias,
      note: call.note,
      displayName: call.displayName,
      createdAt: call.createdAt.toISOString(),
    },
  });
}
