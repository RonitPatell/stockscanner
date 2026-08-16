/**
 * Mid-stream entitlement re-check for SSE / long-lived connections.
 * Handshake-only auth is insufficient — subscription lapse must terminate the stream.
 */

import { prisma } from "@/lib/prisma";
import { hasTrustTickerAccess } from "@/lib/subscription";

/** Default how often live streams re-verify product access. */
export const SSE_ENTITLEMENT_RECHECK_MS = 60_000;

/**
 * Returns true when the user still has TrustTicker access.
 * Fail closed on missing user / DB errors.
 */
export async function userStillHasPro(userId: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        subscriptionStatus: true,
        subscriptionEndsAt: true,
        hasUsedTrial: true,
        cancelAtPeriodEnd: true,
        trialConsumedAt: true,
        trialEndsAt: true,
      },
    });
    if (!user) return false;
    return hasTrustTickerAccess(user);
  } catch {
    return false;
  }
}

/** @deprecated Alias — use userStillHasPro / hasTrustTickerAccess semantics. */
export const userStillHasTrustTickerAccess = userStillHasPro;
