import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = req.nextUrl.searchParams.get("status") || "open";
  const items = await prisma.judgmentReviewItem.findMany({
    where: status === "all" ? {} : { status },
    orderBy: [{ priorityScore: "desc" }, { updatedAt: "desc" }],
    take: 100,
  });

  const feedbackAgg = await prisma.judgmentFeedback.groupBy({
    by: ["action"],
    _count: { action: true },
  });

  return NextResponse.json({
    items,
    feedbackByAction: Object.fromEntries(
      feedbackAgg.map((f) => [f.action, f._count.action])
    ),
    note: "Queue prioritises user reports and high-impact low-confidence events. Feedback never auto-changes production rules.",
  });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  const status = String(body.status ?? "");
  if (!id || !["open", "reviewed", "dismissed"].includes(status)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const adminNote =
    typeof body.adminNote === "string" ? body.adminNote.trim().slice(0, 500) : undefined;

  const item = await prisma.judgmentReviewItem.update({
    where: { id },
    data: {
      status,
      adminNote,
      reviewedAt: status === "open" ? null : new Date(),
      reviewedByEmail: status === "open" ? null : session.user.email,
    },
  });

  return NextResponse.json({ ok: true, item });
}
