import { NextResponse } from "next/server";
import { buildSessionPlan } from "@/lib/session-plan";

export const dynamic = "force-dynamic";

/** Session plan: 3 setups, 2 skips — anti-FOMO morning card. */
export async function GET() {
  const plan = await buildSessionPlan();
  return NextResponse.json(plan);
}
