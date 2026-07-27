import {
  RELIABILITY_DISCLAIMER,
  SERVICE_CREDIT_LEGAL_PLACEHOLDER,
} from "./version.ts";
import { chargeableOutageMinutes } from "./incidents.ts";
import type {
  CreditEvaluationPreview,
  CreditEvalStatus,
  ServiceIncidentRecord,
  SubscriberCreditLine,
} from "./types.ts";
import {
  SUBSCRIPTION_ANNUAL_PRICE,
  SUBSCRIPTION_PRICE,
} from "../stripe.ts";

export interface SubscriberForCredit {
  userId: string;
  email: string;
  stripeCustomerId: string | null;
  subscriptionId: string | null;
  plan: "monthly" | "annual" | "unknown";
  /** Prior credits already applied for this billing period (cents). */
  alreadyCreditedCents: number;
}

function maskEmail(email: string): string {
  const [u, d] = email.split("@");
  if (!u || !d) return "***";
  return `${u.slice(0, 2)}***@${d}`;
}

function periodFeeCents(plan: SubscriberForCredit["plan"]): number {
  if (plan === "annual") return Math.round(SUBSCRIPTION_ANNUAL_PRICE * 100);
  if (plan === "monthly") return Math.round(SUBSCRIPTION_PRICE * 100);
  return Math.round(SUBSCRIPTION_PRICE * 100);
}

function periodMinutes(
  plan: SubscriberForCredit["plan"],
  periodStart: string,
  periodEnd: string
): number {
  const span = Math.max(
    1,
    Math.floor((Date.parse(periodEnd) - Date.parse(periodStart)) / 60_000)
  );
  // Annual subscribers: credit against the annual period length, not a fake month
  if (plan === "annual") return span;
  return span;
}

/**
 * Propose a prorated subscription fee credit from chargeable outage minutes.
 * Never framed as trading-loss reimbursement.
 */
export function proposeCreditCents(input: {
  periodFeeCents: number;
  outageMinutes: number;
  periodMinutes: number;
  alreadyCreditedCents: number;
}): { proposedCreditCents: number; netCreditCents: number } {
  if (input.periodMinutes <= 0 || input.outageMinutes <= 0) {
    return { proposedCreditCents: 0, netCreditCents: 0 };
  }
  const fraction = Math.min(1, input.outageMinutes / input.periodMinutes);
  const proposed = Math.floor(input.periodFeeCents * fraction);
  const remaining = Math.max(0, input.periodFeeCents - input.alreadyCreditedCents);
  const net = Math.min(proposed, remaining);
  return { proposedCreditCents: proposed, netCreditCents: net };
}

/**
 * Detect duplicate credit evaluation for same user+period+incident set.
 */
export function isDuplicateCredit(input: {
  existing: Array<{
    userId: string;
    billingPeriodStart: string;
    billingPeriodEnd: string;
    incidentIds: string[];
    status: CreditEvalStatus;
  }>;
  userId: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  incidentIds: string[];
}): boolean {
  const key = [...input.incidentIds].sort().join(",");
  return input.existing.some(
    (e) =>
      e.userId === input.userId &&
      e.billingPeriodStart === input.billingPeriodStart &&
      e.billingPeriodEnd === input.billingPeriodEnd &&
      [...e.incidentIds].sort().join(",") === key &&
      (e.status === "applied" || e.status === "previewed")
  );
}

export function buildCreditPreview(input: {
  evaluationId: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  incidents: ServiceIncidentRecord[];
  subscribers: SubscriberForCredit[];
  /** Prior applied evaluations for duplicate detection */
  priorApplied?: Array<{
    userId: string;
    billingPeriodStart: string;
    billingPeriodEnd: string;
    incidentIds: string[];
    status: CreditEvalStatus;
  }>;
}): CreditEvaluationPreview {
  const outageMinutes = chargeableOutageMinutes(
    input.incidents,
    input.billingPeriodStart,
    input.billingPeriodEnd
  );
  const incidentIds = input.incidents.map((i) => i.id);
  const lines: SubscriberCreditLine[] = [];

  for (const s of input.subscribers) {
    const fee = periodFeeCents(s.plan);
    const mins = periodMinutes(
      s.plan,
      input.billingPeriodStart,
      input.billingPeriodEnd
    );
    const dup = isDuplicateCredit({
      existing: input.priorApplied ?? [],
      userId: s.userId,
      billingPeriodStart: input.billingPeriodStart,
      billingPeriodEnd: input.billingPeriodEnd,
      incidentIds,
    });
    const { proposedCreditCents, netCreditCents } = proposeCreditCents({
      periodFeeCents: fee,
      outageMinutes,
      periodMinutes: mins,
      alreadyCreditedCents: s.alreadyCreditedCents,
    });

    lines.push({
      userId: s.userId,
      emailMasked: maskEmail(s.email),
      stripeCustomerId: s.stripeCustomerId,
      subscriptionId: s.subscriptionId,
      plan: s.plan,
      billingPeriodStart: input.billingPeriodStart,
      billingPeriodEnd: input.billingPeriodEnd,
      periodFeeCents: fee,
      outageMinutesCharged: outageMinutes,
      periodMinutes: mins,
      proposedCreditCents: dup ? 0 : proposedCreditCents,
      alreadyCreditedCents: s.alreadyCreditedCents,
      netCreditCents: dup ? 0 : netCreditCents,
    });
  }

  const anyDup = lines.every((l) => l.netCreditCents === 0) &&
    (input.priorApplied?.length ?? 0) > 0 &&
    outageMinutes > 0;

  const status: CreditEvalStatus = anyDup && lines.every((l) => l.proposedCreditCents === 0)
    ? "duplicate_blocked"
    : "previewed";

  return {
    evaluationId: input.evaluationId,
    billingPeriodStart: input.billingPeriodStart,
    billingPeriodEnd: input.billingPeriodEnd,
    incidentIds,
    status,
    lines,
    totalProposedCents: lines.reduce((a, l) => a + l.netCreditCents, 0),
    disclaimer: RELIABILITY_DISCLAIMER,
    legalPlaceholder: SERVICE_CREDIT_LEGAL_PLACEHOLDER,
    notTradingLossReimbursement: true,
  };
}

/**
 * Resolve billing period bounds for monthly vs annual subscribers.
 */
export function billingPeriodFor(input: {
  plan: "monthly" | "annual" | "unknown";
  anchorEnd: Date;
}): { start: Date; end: Date } {
  const end = new Date(input.anchorEnd);
  const start = new Date(end);
  if (input.plan === "annual") {
    start.setUTCFullYear(start.getUTCFullYear() - 1);
  } else {
    start.setUTCMonth(start.getUTCMonth() - 1);
  }
  return { start, end };
}
