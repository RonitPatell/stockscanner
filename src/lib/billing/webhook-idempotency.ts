/**
 * Stripe webhook idempotency — store processed event IDs.
 *
 * Claim before work; on handler failure call `releaseStripeEvent` so Stripe
 * retries can re-process (do not leave a row after a failed run).
 */

import { prisma } from "@/lib/prisma";

export async function claimStripeEvent(opts: {
  eventId: string;
  type: string;
}): Promise<"claimed" | "duplicate"> {
  try {
    await prisma.stripeProcessedEvent.create({
      data: {
        id: opts.eventId,
        type: opts.type,
      },
    });
    return "claimed";
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code)
        : "";
    // Prisma unique violation
    if (code === "P2002") return "duplicate";
    throw err;
  }
}

/** Allow Stripe to retry after a failed handler. */
export async function releaseStripeEvent(eventId: string): Promise<void> {
  await prisma.stripeProcessedEvent.deleteMany({ where: { id: eventId } });
}
