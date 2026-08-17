import { NextRequest, NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/api-guard";
import { auth } from "@/lib/auth";
import { hydrateCompanySymbol, productionHydratePorts } from "@/lib/company-readiness";
import { normalizeSymbol, isUsTickerSymbol } from "@/lib/company-identity";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isLocalDev(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    !process.env.VERCEL &&
    !process.env.RAILWAY_ENVIRONMENT &&
    !process.env.RAILWAY_PROJECT_ID
  );
}

/**
 * Developer hydration trigger. Fail-closed outside local next-dev unless admin.
 */
export async function POST(req: NextRequest) {
  const local = isLocalDev();
  if (!local) {
    const session = await auth();
    const email = session?.user?.email ?? null;
    if (!isAdminEmail(email)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let symbol = "";
  try {
    const body = (await req.json()) as { symbol?: string };
    symbol = normalizeSymbol(body.symbol ?? "");
  } catch {
    symbol = normalizeSymbol(req.nextUrl.searchParams.get("symbol") ?? "");
  }
  if (!symbol || !isUsTickerSymbol(symbol)) {
    return NextResponse.json({ error: "Invalid symbol", code: "INVALID" }, { status: 400 });
  }

  try {
    const result = await hydrateCompanySymbol(symbol, productionHydratePorts());
    return NextResponse.json({ ok: true, result });
  } catch {
    return NextResponse.json({ ok: false, error: "Hydration failed" }, { status: 500 });
  }
}
