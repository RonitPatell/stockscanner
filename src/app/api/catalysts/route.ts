import { NextRequest, NextResponse } from "next/server";
import { getCatalysts } from "@/lib/catalyst-engine";
import { getFeedMeta } from "@/lib/feed-cache";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const moversOnly = req.nextUrl.searchParams.get("moversOnly") === "true";
    const catalysts = await getCatalysts(150, { moversOnly });
    const meta = await getFeedMeta();

    return NextResponse.json(catalysts, {
      headers: {
        "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10",
        "X-Feed-Updated": meta?.updatedAt ?? "",
      },
    });
  } catch (error) {
    console.error("Catalysts API error:", error);
    return NextResponse.json({ error: "Failed to fetch catalysts" }, { status: 500 });
  }
}
