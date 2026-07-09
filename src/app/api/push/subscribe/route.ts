import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getVapidPublicKey } from "@/lib/web-push";
import type { PushSubscriptionJson } from "@/lib/web-push";

export async function GET() {
  return NextResponse.json({ publicKey: getVapidPublicKey() });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { subscription?: PushSubscriptionJson };
  if (!body.subscription?.endpoint || !body.subscription?.keys) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { pushSubscription: body.subscription as object },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { pushSubscription: Prisma.DbNull },
  });

  return NextResponse.json({ ok: true });
}
