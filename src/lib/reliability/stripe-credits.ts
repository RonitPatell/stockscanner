import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.ts";
import { getStripe } from "../stripe.ts";
import {
  buildCreditPreview,
  type SubscriberForCredit,
} from "./credits.ts";
import type { CreditEvaluationPreview, ServiceIncidentRecord } from "./types.ts";
import { RELIABILITY_DISCLAIMER, SERVICE_CREDIT_LEGAL_PLACEHOLDER } from "./version.ts";

export async function writeCreditAudit(input: {
  evaluationId?: string | null;
  actorUserId: string;
  action: string;
  detail: Record<string, unknown>;
}): Promise<void> {
  await prisma.serviceCreditAuditLog.create({
    data: {
      evaluationId: input.evaluationId ?? null,
      actorUserId: input.actorUserId,
      action: input.action,
      detailJson: input.detail as Prisma.InputJsonValue,
    },
  });
}

function inferPlan(sub: {
  subscriptionId: string | null;
  subscriptionEndsAt: Date | null;
}): "monthly" | "annual" | "unknown" {
  // Heuristic: annual ends ~11–13 months out from now when just renewed;
  // we store plan in Stripe metadata — fall back to unknown.
  void sub;
  return "unknown";
}

/** Identify active/trialing subscribers potentially affected by incidents. */
export async function findAffectedSubscribers(): Promise<SubscriberForCredit[]> {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { subscriptionStatus: { in: ["active", "trialing", "past_due"] } },
        { subscriptionEndsAt: { gt: new Date() } },
      ],
    },
    select: {
      id: true,
      email: true,
      stripeCustomerId: true,
      subscriptionId: true,
      subscriptionEndsAt: true,
      subscriptionStatus: true,
    },
    take: 5_000,
  });

  return users.map((u) => ({
    userId: u.id,
    email: u.email,
    stripeCustomerId: u.stripeCustomerId,
    subscriptionId: u.subscriptionId,
    plan: inferPlan(u),
    alreadyCreditedCents: 0,
  }));
}

export async function previewServiceCredits(input: {
  evaluationId: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  incidents: ServiceIncidentRecord[];
  actorUserId: string;
  planOverride?: "monthly" | "annual";
}): Promise<CreditEvaluationPreview> {
  const subscribers = await findAffectedSubscribers();
  if (input.planOverride) {
    for (const s of subscribers) s.plan = input.planOverride;
  }

  const prior = await prisma.serviceCreditEvaluation.findMany({
    where: {
      billingPeriodStart: new Date(input.billingPeriodStart),
      billingPeriodEnd: new Date(input.billingPeriodEnd),
      status: { in: ["applied", "previewed"] },
    },
    select: {
      incidentIds: true,
      status: true,
      previewJson: true,
    },
  });

  const priorApplied = prior.flatMap((p) => {
    const lines =
      (p.previewJson as { lines?: Array<{ userId: string }> } | null)?.lines ??
      [];
    return lines.map((l) => ({
      userId: l.userId,
      billingPeriodStart: input.billingPeriodStart,
      billingPeriodEnd: input.billingPeriodEnd,
      incidentIds: p.incidentIds,
      status: p.status as "applied" | "previewed",
    }));
  });

  // Load already-credited cents per user for this period
  const appliedRows = await prisma.serviceCreditEvaluation.findMany({
    where: {
      status: "applied",
      billingPeriodStart: new Date(input.billingPeriodStart),
      billingPeriodEnd: new Date(input.billingPeriodEnd),
    },
    select: { previewJson: true },
  });
  const credited = new Map<string, number>();
  for (const row of appliedRows) {
    const lines =
      (row.previewJson as { lines?: Array<{ userId: string; netCreditCents: number }> })
        ?.lines ?? [];
    for (const l of lines) {
      credited.set(l.userId, (credited.get(l.userId) ?? 0) + (l.netCreditCents ?? 0));
    }
  }
  for (const s of subscribers) {
    s.alreadyCreditedCents = credited.get(s.userId) ?? 0;
  }

  const preview = buildCreditPreview({
    evaluationId: input.evaluationId,
    billingPeriodStart: input.billingPeriodStart,
    billingPeriodEnd: input.billingPeriodEnd,
    incidents: input.incidents,
    subscribers,
    priorApplied,
  });

  await prisma.serviceCreditEvaluation.upsert({
    where: { id: input.evaluationId },
    create: {
      id: input.evaluationId,
      billingPeriodStart: new Date(input.billingPeriodStart),
      billingPeriodEnd: new Date(input.billingPeriodEnd),
      incidentIds: input.incidents.map((i) => i.id),
      status: preview.status,
      previewJson: preview as unknown as Prisma.InputJsonValue,
      amountCents: preview.totalProposedCents,
      reason: "Platform unavailability credit evaluation (preview)",
      legalDisclaimer: SERVICE_CREDIT_LEGAL_PLACEHOLDER,
      createdBy: input.actorUserId,
    },
    update: {
      status: preview.status,
      previewJson: preview as unknown as Prisma.InputJsonValue,
      amountCents: preview.totalProposedCents,
      updatedAt: new Date(),
    },
  });

  await writeCreditAudit({
    evaluationId: input.evaluationId,
    actorUserId: input.actorUserId,
    action: "preview",
    detail: {
      totalProposedCents: preview.totalProposedCents,
      subscriberCount: preview.lines.length,
      incidentIds: preview.incidentIds,
      notTradingLossReimbursement: true,
    },
  });

  return preview;
}

/**
 * Apply previously previewed credits via Stripe customer balance.
 * Requires authorized admin action. Never describes credits as trading-loss reimbursement.
 */
export async function applyServiceCredits(input: {
  evaluationId: string;
  actorUserId: string;
  dryRun?: boolean;
}): Promise<{
  applied: number;
  skipped: number;
  errors: string[];
  disclaimer: string;
}> {
  const row = await prisma.serviceCreditEvaluation.findUnique({
    where: { id: input.evaluationId },
  });
  if (!row) throw new Error("Evaluation not found");
  if (row.status === "applied") {
    return {
      applied: 0,
      skipped: 1,
      errors: ["Already applied — duplicate blocked"],
      disclaimer: RELIABILITY_DISCLAIMER,
    };
  }
  if (row.status === "duplicate_blocked") {
    return {
      applied: 0,
      skipped: 1,
      errors: ["Duplicate credit evaluation blocked"],
      disclaimer: RELIABILITY_DISCLAIMER,
    };
  }

  const preview = row.previewJson as unknown as CreditEvaluationPreview;
  if (!preview?.lines?.length) {
    throw new Error("No preview lines — run preview first");
  }

  if (input.dryRun) {
    await writeCreditAudit({
      evaluationId: input.evaluationId,
      actorUserId: input.actorUserId,
      action: "apply_dry_run",
      detail: { totalProposedCents: preview.totalProposedCents },
    });
    return {
      applied: 0,
      skipped: preview.lines.length,
      errors: [],
      disclaimer: RELIABILITY_DISCLAIMER,
    };
  }

  const stripe = getStripe();
  let applied = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const line of preview.lines) {
    if (line.netCreditCents <= 0) {
      skipped += 1;
      continue;
    }
    if (!line.stripeCustomerId) {
      skipped += 1;
      errors.push(`${line.emailMasked}: no Stripe customer`);
      continue;
    }
    try {
      // Negative amount = credit on customer balance (Stripe convention)
      await stripe.customers.createBalanceTransaction(line.stripeCustomerId, {
        amount: -line.netCreditCents,
        currency: "usd",
        description:
          "TrustTicker subscription service credit for documented platform unavailability. Not reimbursement for trading loss.",
        metadata: {
          evaluationId: input.evaluationId,
          userId: line.userId,
          kind: "service_availability_credit",
        },
      });
      applied += 1;
    } catch (e) {
      errors.push(
        `${line.emailMasked}: ${e instanceof Error ? e.message : "stripe error"}`
      );
    }
  }

  await prisma.serviceCreditEvaluation.update({
    where: { id: input.evaluationId },
    data: {
      status: "applied",
      appliedAt: new Date(),
      appliedBy: input.actorUserId,
    },
  });

  await writeCreditAudit({
    evaluationId: input.evaluationId,
    actorUserId: input.actorUserId,
    action: "apply",
    detail: {
      applied,
      skipped,
      errorCount: errors.length,
      notTradingLossReimbursement: true,
    },
  });

  return { applied, skipped, errors, disclaimer: RELIABILITY_DISCLAIMER };
}
