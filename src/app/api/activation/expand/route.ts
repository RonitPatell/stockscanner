import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { bumpCatalystExpand } from "@/lib/activation";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const count = await bumpCatalystExpand(session.user.id);
  return NextResponse.json({ ok: true, catalystsExpandedCount: count });
}
