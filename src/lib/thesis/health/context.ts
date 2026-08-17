/**
 * Load Thesis Health evaluation context from DB (bounded — not full history dumps).
 */

import { prisma } from "../../prisma.ts";
import type {
  ThesisHealthCapitalSnapshot,
  ThesisHealthCompanyEvent,
  ThesisHealthConditionInput,
  ThesisHealthContext,
  ThesisHealthMetricObservation,
} from "./types.ts";
import type { ThesisConditionPolarity, ThesisConditionType } from "../types.ts";

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return {};
}

export type LoadedThesisForHealth = {
  id: string;
  userId: string;
  symbol: string;
  status: string;
  createdAt: Date;
  conditions: ThesisHealthConditionInput[];
};

export async function loadThesisForHealth(
  thesisId: string
): Promise<LoadedThesisForHealth | null> {
  const row = await prisma.investmentThesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      userId: true,
      symbol: true,
      status: true,
      createdAt: true,
      conditions: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          conditionType: true,
          label: true,
          polarity: true,
          paramsJson: true,
        },
      },
    },
  });
  if (!row) return null;

  return {
    id: row.id,
    userId: row.userId,
    symbol: row.symbol,
    status: row.status,
    createdAt: row.createdAt,
    conditions: row.conditions.map((c) => ({
      id: c.id,
      conditionType: c.conditionType as ThesisConditionType,
      label: c.label,
      polarity: c.polarity as ThesisConditionPolarity,
      params: asRecord(c.paramsJson),
    })),
  };
}

async function loadObservations(
  symbol: string
): Promise<ThesisHealthMetricObservation[]> {
  const rows = await prisma.metricObservation.findMany({
    where: { symbol },
    orderBy: [{ periodEnd: "desc" }, { filedAt: "desc" }],
    take: 400,
    select: {
      metricKey: true,
      value: true,
      periodStart: true,
      periodEnd: true,
      periodLabel: true,
      fiscalYear: true,
      fiscalPeriod: true,
      filedAt: true,
      accession: true,
      sourceUrl: true,
      fingerprint: true,
      unit: true,
      confidence: true,
      sourceType: true,
      secConcept: true,
      evidenceJson: true,
    },
  });

  return rows.map((r) => ({
    metricKey: r.metricKey,
    value: r.value,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    periodLabel: r.periodLabel,
    fiscalYear: r.fiscalYear,
    fiscalPeriod: r.fiscalPeriod,
    filedAt: r.filedAt,
    accession: r.accession,
    sourceUrl: r.sourceUrl,
    fingerprint: r.fingerprint,
    unit: r.unit,
    confidence: r.confidence,
    sourceType: r.sourceType,
    secConcept: r.secConcept,
    evidence: asRecord(r.evidenceJson),
  }));
}

async function loadEvents(
  symbol: string,
  since: Date
): Promise<ThesisHealthCompanyEvent[]> {
  // Include a small lookback so "after thesis start" boundary is exact in app code.
  const rows = await prisma.companyEvent.findMany({
    where: {
      symbol,
      occurredAt: { gte: new Date(since.getTime() - 86_400_000) },
    },
    orderBy: [{ occurredAt: "desc" }],
    take: 200,
    select: {
      id: true,
      eventType: true,
      title: true,
      occurredAt: true,
      sourceUrl: true,
      sourceId: true,
      severity: true,
      category: true,
    },
  });

  return rows.map((r) => ({
    id: r.id,
    eventType: r.eventType,
    title: r.title,
    occurredAt: r.occurredAt,
    sourceUrl: r.sourceUrl,
    sourceId: r.sourceId,
    severity: r.severity,
    category: r.category,
  }));
}

async function loadCapitalRisk(
  symbol: string
): Promise<ThesisHealthCapitalSnapshot> {
  const row = await prisma.capitalRiskSnapshot.findFirst({
    where: { symbol },
    orderBy: [{ asOf: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      status: true,
      asOf: true,
      summary: true,
      fingerprint: true,
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    asOf: row.asOf,
    summary: row.summary,
    fingerprint: row.fingerprint,
  };
}

export async function loadThesisHealthContext(
  thesis: LoadedThesisForHealth,
  evaluatedAt: Date = new Date()
): Promise<ThesisHealthContext> {
  const [observations, events, capitalRisk] = await Promise.all([
    loadObservations(thesis.symbol),
    loadEvents(thesis.symbol, thesis.createdAt),
    loadCapitalRisk(thesis.symbol),
  ]);

  return {
    symbol: thesis.symbol,
    thesisCreatedAt: thesis.createdAt,
    evaluatedAt,
    observations,
    events,
    capitalRisk,
  };
}

/** Active theses for a symbol (for trigger fan-out). */
export async function listActiveThesisIdsForSymbol(
  symbol: string
): Promise<string[]> {
  const sym = symbol.trim().toUpperCase();
  const rows = await prisma.investmentThesis.findMany({
    where: { symbol: sym, status: "active" },
    select: { id: true },
    take: 200,
  });
  return rows.map((r) => r.id);
}
