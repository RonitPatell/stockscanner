import { NextResponse } from "next/server";
import { getCatalysts } from "@/lib/catalyst-engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const catalysts = await getCatalysts();
    return NextResponse.json(catalysts);
  } catch (error) {
    console.error("Catalysts API error:", error);
    return NextResponse.json({ error: "Failed to fetch catalysts" }, { status: 500 });
  }
}
