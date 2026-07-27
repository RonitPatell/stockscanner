import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { previewAlertModes } from "@/lib/alerts/modes";
import { getCoverageBadges } from "@/lib/coverage/coverage-service";
import { requirePro } from "@/lib/api-guard";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { mapPublicCatalyst } from "@/lib/coverage/public-catalyst";

export async function GET(req: NextRequest) {
  const gate = await requirePro();
  if (gate.error) return gate.error;

  const ip = clientIp(req);
  const rl = await rateLimit(`alert-preview:${gate.user.id}:${ip}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rateLimitHeaders(rl, 60) }
    );
  }

  const catalystId = req.nextUrl.searchParams.get("catalystId");
  if (!catalystId) {
    return NextResponse.json({ error: "catalystId required" }, { status: 400 });
  }

  const row = await prisma.catalyst.findUnique({ where: { id: catalystId } });
  if (!row || row.quarantined) {
    return NextResponse.json({ error: "Catalyst not found" }, { status: 404 });
  }

  const catalyst = mapPublicCatalyst(row);
  const previews = previewAlertModes(catalyst, {
    changePercent: catalyst.changePercent,
    rVol: catalyst.rVol,
  });
  const coverage = await getCoverageBadges(catalyst.symbol);

  return NextResponse.json({
    catalystId: catalyst.id,
    symbol: catalyst.symbol,
    match: {
      confidence: catalyst.verifiedConfidence ?? null,
      method: catalyst.matchMethod ?? null,
    },
    coverage,
    modes: previews.map((p) => ({
      mode: p.mode,
      wouldFire: p.wouldFire,
      triggered: p.triggered,
      blocked: p.blocked,
    })),
  });
}
