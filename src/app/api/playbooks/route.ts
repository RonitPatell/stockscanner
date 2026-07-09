import { NextRequest, NextResponse } from "next/server";
import { getCatalystPlaybook } from "@/lib/playbooks";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") || "other";
  const floatRaw = req.nextUrl.searchParams.get("float");
  const float = floatRaw ? Number(floatRaw) : null;

  const playbook = await getCatalystPlaybook(type, float);
  return NextResponse.json(playbook);
}
