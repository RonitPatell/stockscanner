import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasActiveSubscription } from "@/lib/subscription";
import { timingSafeEqual } from "node:crypto";

export type AuthedUser = {
  id: string;
  email: string | null;
  subscriptionStatus: string | null;
  subscriptionEndsAt: Date | null;
};

export async function requireUser(): Promise<
  { user: AuthedUser; error?: undefined } | { user?: undefined; error: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      subscriptionStatus: true,
      subscriptionEndsAt: true,
    },
  });
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { user };
}

/** Paid product APIs — active / trialing / grace period. */
export async function requirePro(): Promise<
  { user: AuthedUser; error?: undefined } | { user?: undefined; error: NextResponse }
> {
  const result = await requireUser();
  if (result.error) return result;
  if (!hasActiveSubscription(result.user)) {
    return {
      error: NextResponse.json(
        { error: "Pro subscription required", code: "PRO_REQUIRED" },
        { status: 403 }
      ),
    };
  }
  return result;
}

function normalizeCronSecret(raw: string | undefined | null): string {
  return (raw ?? "")
    .trim()
    .replace(/^['"]/, "")
    .replace(/['"]$/, "")
    .trim();
}

function secretsMatch(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Cron / worker Bearer auth — fail closed without CRON_SECRET outside development. */
export function authorizeCron(req: Request): boolean {
  const secret = normalizeCronSecret(process.env.CRON_SECRET);
  if (!secret) {
    return process.env.NODE_ENV === "development";
  }

  const auth = (req.headers.get("authorization") || "").trim();
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();
  const alt = normalizeCronSecret(req.headers.get("x-cron-secret"));

  return secretsMatch(bearer, secret) || secretsMatch(alt, secret);
}

export function cronUnauthorized(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
