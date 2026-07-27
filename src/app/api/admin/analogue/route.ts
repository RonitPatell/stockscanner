import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/api-guard";
import { getAnalogueBiasReport, ANALOGUE_ENGINE_VERSION } from "@/lib/analogue";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const report = await getAnalogueBiasReport({ lookbackDays: 365 });
  return NextResponse.json({
    engineVersion: ANALOGUE_ENGINE_VERSION,
    ...report,
  });
}
