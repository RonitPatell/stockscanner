/**
 * TrustTicker 7-day trial — server-authoritative windows + race-safe consume.
 * Reuses TrialClaim (email/phone hashes) and User.hasUsedTrial.
 * Never trusts client timestamps or checkout-return query params.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma.ts";
import {
  hashEmailForTrialClaim,
  hashPhoneForTrialClaim,
} from "./trial-claims.ts";

export const TRIAL_DURATION_DAYS = 7;
export const TRIAL_DURATION_MS = TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000;

export type TrialUserFields = {
  hasUsedTrial?: boolean | null;
  trialConsumedAt?: Date | string | null;
  trialStartedAt?: Date | string | null;
  trialEndsAt?: Date | string | null;
  subscriptionStatus?: string | null;
  subscriptionEndsAt?: Date | string | null;
};

export type TrialWindow = {
  startedAt: Date;
  endsAt: Date;
};

export type TrialAccessDisplay =
  | { kind: "none"; label: null }
  | {
      kind: "active";
      label: string;
      endsAt: string;
      daysRemaining: number;
    }
  | {
      kind: "expired";
      label: "Trial expired";
      endsAt: string;
      daysRemaining: 0;
    };

type Tx = Prisma.TransactionClient | PrismaClient;

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Exact 7-day window from a server `now` (never from the client). */
export function computeTrialWindow(now: Date = new Date()): TrialWindow {
  const startedAt = new Date(now.getTime());
  const endsAt = new Date(startedAt.getTime() + TRIAL_DURATION_MS);
  return { startedAt, endsAt };
}

export function hasConsumedTrial(user: TrialUserFields | null | undefined): boolean {
  if (!user) return false;
  if (user.hasUsedTrial) return true;
  return toDate(user.trialConsumedAt) != null;
}

/**
 * Account-level eligibility before durable TrialClaim check.
 * Does not inspect browser/localStorage/query params.
 */
export function isAccountTrialEligible(
  user: TrialUserFields | null | undefined
): boolean {
  return !hasConsumedTrial(user);
}

export function evaluateTrialEligibility(opts: {
  user: TrialUserFields | null | undefined;
  durableClaimExists: boolean;
}): { eligible: boolean; reason: string } {
  if (!isAccountTrialEligible(opts.user)) {
    return { eligible: false, reason: "account_consumed" };
  }
  if (opts.durableClaimExists) {
    return { eligible: false, reason: "durable_claim" };
  }
  return { eligible: true, reason: "ok" };
}

/** Prefer explicit trialEndsAt; fall back to subscriptionEndsAt while trialing. */
export function getAuthoritativeTrialEndsAt(
  user: TrialUserFields | null | undefined
): Date | null {
  if (!user) return null;
  const explicit = toDate(user.trialEndsAt);
  if (explicit) return explicit;
  const status = (user.subscriptionStatus ?? "").toLowerCase();
  if (status === "trialing") return toDate(user.subscriptionEndsAt);
  return null;
}

/**
 * Calendar-day remaining for display (server `now`).
 * 0 means ends today or already ended (caller distinguishes via endsAt vs now).
 */
export function trialCalendarDaysRemaining(endsAt: Date, now: Date): number {
  if (endsAt.getTime() <= now.getTime()) return 0;
  const ms = endsAt.getTime() - now.getTime();
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

/**
 * User-visible trial copy from **server** user fields + server `now`.
 * Ignores any client-supplied timestamps (do not pass them in).
 */
export function getTrialAccessDisplay(
  user: TrialUserFields | null | undefined,
  now: Date = new Date()
): TrialAccessDisplay {
  if (!user || !hasConsumedTrial(user)) {
    return { kind: "none", label: null };
  }

  const endsAt = getAuthoritativeTrialEndsAt(user);
  if (!endsAt) {
    // Consumed but no end stamped (legacy) — treat as expired for display.
    return {
      kind: "expired",
      label: "Trial expired",
      endsAt: now.toISOString(),
      daysRemaining: 0,
    };
  }

  const endsIso = endsAt.toISOString();
  if (endsAt.getTime() <= now.getTime()) {
    return {
      kind: "expired",
      label: "Trial expired",
      endsAt: endsIso,
      daysRemaining: 0,
    };
  }

  const status = (user.subscriptionStatus ?? "").toLowerCase();
  // Converted to paid — trial banner not shown as active trial.
  if (status === "active" || status === "past_due") {
    return { kind: "none", label: null };
  }

  const days = trialCalendarDaysRemaining(endsAt, now);
  const sameUtcDay =
    endsAt.getUTCFullYear() === now.getUTCFullYear() &&
    endsAt.getUTCMonth() === now.getUTCMonth() &&
    endsAt.getUTCDate() === now.getUTCDate();

  if (sameUtcDay || days <= 1) {
    return {
      kind: "active",
      label: "Trial ends today",
      endsAt: endsIso,
      daysRemaining: 1,
    };
  }

  return {
    kind: "active",
    label: `Trial ends in ${days} days`,
    endsAt: endsIso,
    daysRemaining: days,
  };
}

async function upsertTrialClaims(
  tx: Tx,
  opts: { email?: string | null; phoneNumber?: string | null }
): Promise<void> {
  const rows: { claimType: string; claimHash: string }[] = [];
  if (opts.email) {
    rows.push({
      claimType: "email_hash",
      claimHash: hashEmailForTrialClaim(opts.email),
    });
  }
  if (opts.phoneNumber) {
    const digits = opts.phoneNumber.replace(/\D/g, "");
    if (digits.length >= 10) {
      rows.push({
        claimType: "phone_hash",
        claimHash: hashPhoneForTrialClaim(digits),
      });
    }
  }
  for (const row of rows) {
    await tx.trialClaim.upsert({
      where: {
        claimType_claimHash: {
          claimType: row.claimType,
          claimHash: row.claimHash,
        },
      },
      create: row,
      update: {},
    });
  }
}

export type ConsumeTrialResult =
  | {
      ok: true;
      started: boolean;
      window: TrialWindow;
    }
  | {
      ok: false;
      reason: "already_consumed" | "not_found";
    };

/**
 * Race-safe trial consume: at most one winner per user id.
 * Uses updateMany predicates + durable TrialClaim upserts in one transaction.
 */
export async function consumeTrialForUser(opts: {
  userId: string;
  email: string;
  phoneNumber?: string | null;
  now?: Date;
  /** Extra stripe fields to set when winning the race. */
  stripe?: {
    subscriptionId?: string | null;
    stripeCustomerId?: string | null;
    planTier?: string | null;
    cancelAtPeriodEnd?: boolean;
  };
}): Promise<ConsumeTrialResult> {
  const now = opts.now ?? new Date();
  const window = computeTrialWindow(now);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({
      where: { id: opts.userId },
      select: {
        id: true,
        hasUsedTrial: true,
        trialConsumedAt: true,
        trialStartedAt: true,
        trialEndsAt: true,
      },
    });
    if (!existing) return { ok: false as const, reason: "not_found" as const };

    if (hasConsumedTrial(existing)) {
      return {
        ok: false as const,
        reason: "already_consumed" as const,
      };
    }

    const updated = await tx.user.updateMany({
      where: {
        id: opts.userId,
        hasUsedTrial: false,
        trialConsumedAt: null,
      },
      data: {
        hasUsedTrial: true,
        trialConsumedAt: window.startedAt,
        trialStartedAt: window.startedAt,
        trialEndsAt: window.endsAt,
        subscriptionStatus: "trialing",
        subscriptionEndsAt: window.endsAt,
        ...(opts.stripe?.subscriptionId != null
          ? { subscriptionId: opts.stripe.subscriptionId }
          : {}),
        ...(opts.stripe?.stripeCustomerId
          ? { stripeCustomerId: opts.stripe.stripeCustomerId }
          : {}),
        ...(opts.stripe?.planTier != null
          ? { planTier: opts.stripe.planTier }
          : {}),
        ...(opts.stripe?.cancelAtPeriodEnd != null
          ? { cancelAtPeriodEnd: opts.stripe.cancelAtPeriodEnd }
          : {}),
      },
    });

    if (updated.count === 0) {
      return { ok: false as const, reason: "already_consumed" as const };
    }

    await upsertTrialClaims(tx, {
      email: opts.email,
      phoneNumber: opts.phoneNumber,
    });

    return { ok: true as const, started: true, window };
  });
}

/**
 * Pure helper for concurrent-claim unit tests (mirrors updateMany semantics).
 * Returns true only for the first successful claim on a shared slot object.
 */
export function tryClaimTrialSlot(slot: {
  hasUsedTrial: boolean;
  trialConsumedAt: Date | null;
}): boolean {
  if (slot.hasUsedTrial || slot.trialConsumedAt != null) return false;
  slot.hasUsedTrial = true;
  slot.trialConsumedAt = new Date();
  return true;
}
