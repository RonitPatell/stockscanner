import { NextResponse } from "next/server";
import { requirePro } from "@/lib/api-guard";
import { buildSessionPlan } from "@/lib/session-plan";

export const dynamic = "force-dynamic";

/** Session plan: 3 setups, 2 skips — anti-FOMO morning card. */
export async function GET() {
  const gate = await requirePro();
  if (gate.error) return gate.error;

  const plan = await buildSessionPlan();
  return NextResponse.json(plan);
}
