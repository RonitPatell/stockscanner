import { NextResponse } from "next/server";
import { requirePro } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Full catalyst detail (key points, summary) — loaded on card expand. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requirePro();
  if (gate.error) return gate.error;

  const { id } = await params;
  const row = await prisma.catalyst.findUnique({
    where: { id },
    select: {
      id: true,
      aiSummary: true,
      keyPoints: true,
      headline: true,
      source: true,
      sourceUrl: true,
      historicalAvgMove: true,
      historicalSampleSize: true,
    },
  });

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(row);
}
