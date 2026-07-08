import { NextRequest, NextResponse } from "next/server";
import { getCatalysts } from "@/lib/catalyst-engine";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const moversOnly = req.nextUrl.searchParams.get("moversOnly") === "true";
    const catalysts = await getCatalysts(80, { moversOnly });
    return NextResponse.json(catalysts);
  } catch (error) {
    console.error("Catalysts API error:", error);
    return NextResponse.json({ error: "Failed to fetch catalysts" }, { status: 500 });
  }
}
