/**
 * Mid-stream Pro entitlement re-check for SSE / long-lived connections.
 * Handshake-only auth is insufficient — subscription lapse must terminate the stream.
 */

import { prisma } from "@/lib/prisma";
import { hasActiveSubscription } from "@/lib/subscription";

/** Default how often live streams re-verify Pro status. */
export const SSE_ENTITLEMENT_RECHECK_MS = 60_000;

/**
 * Returns true when the user still has Pro access.
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
      },
    });
    if (!user) return false;
    return hasActiveSubscription(user);
  } catch {
    return false;
  }
}
