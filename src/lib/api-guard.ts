import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasTrustTickerAccess } from "@/lib/subscription";
import {
  authorizeCron,
  getAdminEmails,
  isAdminEmail,
} from "@/lib/cron-authorize";

export { authorizeCron, getAdminEmails, isAdminEmail };

export type AuthedUser = {
  id: string;
  email: string | null;
  subscriptionStatus: string | null;
  subscriptionEndsAt: Date | null;
  planTier: string | null;
  hasUsedTrial: boolean;
  cancelAtPeriodEnd: boolean;
  trialConsumedAt: Date | null;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
};

const USER_SELECT = {
  id: true,
  email: true,
  subscriptionStatus: true,
  subscriptionEndsAt: true,
  planTier: true,
  hasUsedTrial: true,
  cancelAtPeriodEnd: true,
  trialConsumedAt: true,
  trialStartedAt: true,
  trialEndsAt: true,
} as const;

export async function requireUser(): Promise<
  { user: AuthedUser; error?: undefined } | { user?: undefined; error: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: USER_SELECT,
  });
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { user };
}

/**
 * Full TrustTicker product access (trial or paid / grace / past_due).
 * Server-side only — never trust client plan or query params.
 */
export async function requireTrustTickerAccess(): Promise<
  { user: AuthedUser; error?: undefined } | { user?: undefined; error: NextResponse }
> {
  const result = await requireUser();
  if (result.error) return result;
  if (!hasTrustTickerAccess(result.user)) {
    return {
      error: NextResponse.json(
        {
          error: "TrustTicker subscription required",
          code: "SUBSCRIPTION_REQUIRED",
        },
        { status: 403 }
      ),
    };
  }
  return result;
}

/**
 * @deprecated Use requireTrustTickerAccess — Plus is not a feature tier.
 */
export async function requirePlus(): Promise<
  { user: AuthedUser; error?: undefined } | { user?: undefined; error: NextResponse }
> {
  return requireTrustTickerAccess();
}

/**
 * @deprecated Use requireTrustTickerAccess — Pro is not a feature tier.
 */
export async function requirePro(): Promise<
  { user: AuthedUser; error?: undefined } | { user?: undefined; error: NextResponse }
> {
  return requireTrustTickerAccess();
}

export function cronUnauthorized(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/** Authenticated admin gate — email must be in ADMIN_EMAILS. */
export async function requireAdmin(): Promise<
  { user: AuthedUser; error?: undefined } | { user?: undefined; error: NextResponse }
> {
  const result = await requireUser();
  if (result.error) return result;
  if (!isAdminEmail(result.user.email)) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return result;
}
