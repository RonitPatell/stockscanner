import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-guard";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { isUsTickerSymbol, normalizeSymbol } from "@/lib/company-identity";
import {
  collectReadinessAggregates,
  getAdminCompanyReadiness,
  retryAdminHydration,
} from "@/lib/company-readiness/admin";

export const dynamic = "force-dynamic";

function noStore(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const symbolRaw = req.nextUrl.searchParams.get("symbol") ?? "";
  const symbol = normalizeSymbol(symbolRaw);
  const aggregates = await collectReadinessAggregates();

  if (!symbol) {
    return noStore({ aggregates, company: null });
  }
  if (!isUsTickerSymbol(symbol)) {
    return noStore({ error: "Invalid symbol", code: "INVALID", aggregates }, 400);
  }

  const company = await getAdminCompanyReadiness(symbol);
  return noStore({ aggregates, company });
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  const ip = clientIp(req);
  const rl = await rateLimit(`admin-hydrate:${gate.user.id}:${ip}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many retries" },
      { status: 429, headers: rateLimitHeaders(rl, 20) }
    );
  }

  const raw = await req.json().catch(() => null);
  const symbol = normalizeSymbol(
    raw && typeof raw === "object" && "symbol" in raw
      ? String((raw as { symbol?: unknown }).symbol ?? "")
      : ""
  );
  if (!symbol || !isUsTickerSymbol(symbol)) {
    return noStore({ error: "Invalid symbol", code: "INVALID" }, 400);
  }

  const result = await retryAdminHydration(symbol);
  const company = await getAdminCompanyReadiness(symbol);
  return noStore({ ok: result.ok, company, readiness: result.readiness });
}
