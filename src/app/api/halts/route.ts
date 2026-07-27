import { NextRequest, NextResponse } from "next/server";
import { requirePro } from "@/lib/api-guard";
import {
  getActiveHalt,
  listActiveHalts,
  listTransitions,
  buildHaltCardModel,
} from "@/lib/halt-monitor";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requirePro();
  if (gate.error) return gate.error;

  const symbol = req.nextUrl.searchParams.get("symbol")?.toUpperCase();
  if (symbol) {
    const halt = await getActiveHalt(symbol);
    const card = await buildHaltCardModel(symbol, halt);
    const transitions = await listTransitions(symbol, 40);
    return NextResponse.json({
      symbol,
      halt,
      card,
      transitions,
      sessionHaltCount: card.sessionHaltCount,
    });
  }

  const active = await listActiveHalts();
  return NextResponse.json({
    active,
    count: active.length,
  });
}
