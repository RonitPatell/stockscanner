import { NextRequest, NextResponse } from "next/server";
import { requireTrustTickerAccess } from "@/lib/api-guard";
import { listThesisHistoryForUser } from "@/lib/thesis/history";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/thesis/[id]/history
 * Private revision + evaluation timeline. Session user only.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const gate = await requireTrustTickerAccess();
  if (gate.error) return gate.error;

  const { id } = await ctx.params;
  if (!id || id.length > 64) {
    return NextResponse.json(
      { error: "Invalid thesis id", code: "INVALID" },
      { status: 400 }
    );
  }

  const history = await listThesisHistoryForUser(gate.user.id, id);
  if (!history) {
    return NextResponse.json(
      { error: "Thesis not found", code: "NOT_FOUND" },
      { status: 404 }
    );
  }
  return NextResponse.json({ history });
}
