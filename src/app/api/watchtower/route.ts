import { NextRequest, NextResponse } from "next/server";
import { requireTrustTickerAccess } from "@/lib/api-guard";
import {
  getWatchtowerFeed,
  watchtowerFeedQuerySchema,
  zodErrorMessage,
} from "@/lib/watchtower";

export const dynamic = "force-dynamic";

/**
 * GET /api/watchtower
 * Portfolio-scoped CompanyEvent feed ("What Changed").
 * Entitlement: requireTrustTickerAccess. Never accepts client userId.
 */
export async function GET(req: NextRequest) {
  const gate = await requireTrustTickerAccess();
  if (gate.error) return gate.error;

  const sp = req.nextUrl.searchParams;
  const raw = {
    cursor: sp.get("cursor") ?? undefined,
    limit: sp.get("limit") ?? undefined,
    since: sp.get("since") ?? undefined,
    until: sp.get("until") ?? undefined,
    category: sp.get("category") ?? undefined,
    severity: sp.get("severity") ?? undefined,
    significance: sp.get("significance") ?? undefined,
    symbol: sp.get("symbol") ?? undefined,
    includeDismissed: sp.get("includeDismissed") ?? undefined,
    unreadOnly: sp.get("unreadOnly") ?? undefined,
  };

  const parsed = watchtowerFeedQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: zodErrorMessage(parsed.error), code: "INVALID" },
      { status: 400 }
    );
  }

  const result = await getWatchtowerFeed(gate.user.id, parsed.data);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: 400 }
    );
  }

  return NextResponse.json(result.result);
}
