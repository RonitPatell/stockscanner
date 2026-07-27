import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCoverageBadges } from "@/lib/coverage/coverage-service";
import { getSymbolMasterMeta } from "@/lib/coverage/symbol-master";
import {
  COVERAGE_REASON_HINTS,
  COVERAGE_REASON_LABELS,
  isCoverageReason,
} from "@/lib/coverage/types";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const symbol = (req.nextUrl.searchParams.get("symbol") || "").toUpperCase();
  if (!/^[A-Z]{1,5}$/.test(symbol)) {
    return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  }

  const [badges, meta] = await Promise.all([
    getCoverageBadges(symbol),
    getSymbolMasterMeta(symbol),
  ]);

  return NextResponse.json({
    symbol,
    listed: meta?.listed ?? false,
    assetType: meta?.assetType ?? null,
    name: meta?.name ?? null,
    badges,
    // Honest disclaimer for UI
    disclaimer:
      "Coverage means we may poll or retain catalysts for this symbol — not that we have exchange-halt feeds, full-tape quotes, or every US listing in real time.",
    reasonCatalog: Object.fromEntries(
      Object.entries(COVERAGE_REASON_LABELS).map(([k, label]) => [
        k,
        {
          label,
          hint: isCoverageReason(k) ? COVERAGE_REASON_HINTS[k] : "",
        },
      ])
    ),
  });
}
