import { NextResponse } from "next/server";
import { requireTrustTickerAccess } from "@/lib/api-guard";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Recent alert delivery history for the logged-in user */
export async function GET() {
  const gate = await requireTrustTickerAccess();
  if (gate.error) return gate.error;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const logs = await prisma.alertLog.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: {
      id: true,
      channel: true,
      status: true,
      createdAt: true,
      catalyst: {
        select: {
          symbol: true,
          headline: true,
          changePercent: true,
        },
      },
    },
  });

  return NextResponse.json({
    alerts: logs.map((l) => ({
      id: l.id,
      channel: l.channel,
      status: l.status,
      createdAt: l.createdAt.toISOString(),
      symbol: l.catalyst.symbol,
      headline: l.catalyst.headline,
      changePercent: l.catalyst.changePercent,
    })),
  });
}
