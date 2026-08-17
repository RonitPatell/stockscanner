/**
 * Thesis revision + evaluation history.
 * Threshold edits never rewrite prior evaluation snapshots.
 */

import { prisma } from "../prisma.ts";
import { parseHealthResultsJson } from "./health/parse-results.ts";
import type { ThesisConditionEvalState } from "./types.ts";

export const THESIS_REVISION_KINDS = [
  "created",
  "text",
  "status",
  "condition_created",
  "condition_updated",
  "condition_deleted",
] as const;

export type ThesisRevisionKind = (typeof THESIS_REVISION_KINDS)[number];

export type ThesisRevisionRecord = {
  id: string;
  thesisId: string;
  kind: ThesisRevisionKind;
  summary: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type ThesisEvaluationHistoryItem = {
  id: string;
  evaluatedAt: string;
  healthStatus: string;
  summary: string | null;
  conditions: Array<{
    conditionId: string;
    label: string | null;
    state: ThesisConditionEvalState | null;
    mode: "automated" | "manual";
    threshold: number | null;
    actualValue: number | null;
    explanation: string | null;
    paramsSnapshot: Record<string, unknown> | null;
  }>;
};

export type ThesisHistoryDto = {
  thesisId: string;
  createdAt: string;
  revisions: ThesisRevisionRecord[];
  evaluations: ThesisEvaluationHistoryItem[];
};

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return {};
}

export function isMaterialTextChange(
  prev: string | null | undefined,
  next: string | null | undefined
): boolean {
  const a = (prev ?? "").trim();
  const b = (next ?? "").trim();
  return a !== b;
}

export function buildThesisRevision(opts: {
  thesisId: string;
  kind: ThesisRevisionKind;
  summary: string;
  payload?: Record<string, unknown>;
  now?: Date;
  id?: string;
}): ThesisRevisionRecord {
  return {
    id: opts.id ?? `rev-${opts.kind}-${(opts.now ?? new Date()).toISOString()}`,
    thesisId: opts.thesisId,
    kind: opts.kind,
    summary: opts.summary.slice(0, 280),
    payload: opts.payload ?? {},
    createdAt: (opts.now ?? new Date()).toISOString(),
  };
}

type RevisionDelegate = {
  create: (args: {
    data: {
      thesisId: string;
      kind: string;
      summary: string;
      payloadJson: unknown;
    };
    select: { id: true; kind: true; summary: true; payloadJson: true; createdAt: true; thesisId: true };
  }) => Promise<{
    id: string;
    kind: string;
    summary: string;
    payloadJson: unknown;
    createdAt: Date;
    thesisId: string;
  }>;
  findMany: (args: {
    where: { thesisId: string };
    orderBy: { createdAt: "asc" };
    take: number;
  }) => Promise<
    Array<{
      id: string;
      kind: string;
      summary: string;
      payloadJson: unknown;
      createdAt: Date;
      thesisId: string;
    }>
  >;
};

function revisionDelegate(): RevisionDelegate | null {
  const d = (prisma as unknown as { thesisRevision?: RevisionDelegate })
    .thesisRevision;
  return d ?? null;
}

export async function appendThesisRevision(opts: {
  thesisId: string;
  kind: ThesisRevisionKind;
  summary: string;
  payload?: Record<string, unknown>;
}): Promise<ThesisRevisionRecord | null> {
  const d = revisionDelegate();
  if (!d) return null;
  try {
    const row = await d.create({
      data: {
        thesisId: opts.thesisId,
        kind: opts.kind,
        summary: opts.summary.slice(0, 280),
        payloadJson: opts.payload ?? {},
      },
      select: {
        id: true,
        kind: true,
        summary: true,
        payloadJson: true,
        createdAt: true,
        thesisId: true,
      },
    });
    return {
      id: row.id,
      thesisId: row.thesisId,
      kind: row.kind as ThesisRevisionKind,
      summary: row.summary,
      payload: asRecord(row.payloadJson),
      createdAt: row.createdAt.toISOString(),
    };
  } catch {
    return null;
  }
}

function parseEvaluationItem(row: {
  id: string;
  evaluatedAt: Date;
  healthStatus: string;
  summary: string | null;
  resultsJson: unknown;
}): ThesisEvaluationHistoryItem {
  const parsed = parseHealthResultsJson(row.resultsJson);
  const root = asRecord(row.resultsJson);
  const rawConditions = Array.isArray(root.conditions) ? root.conditions : [];
  const byId = new Map<string, Record<string, unknown>>();
  for (const c of rawConditions) {
    const r = asRecord(c);
    if (typeof r.conditionId === "string") byId.set(r.conditionId, r);
  }

  const conditions = [...parsed.byConditionId.entries()].map(
    ([conditionId, ev]) => {
      const raw = byId.get(conditionId) ?? {};
      const threshold =
        typeof raw.threshold === "number" && Number.isFinite(raw.threshold)
          ? raw.threshold
          : null;
      const actualValue =
        typeof raw.actualValue === "number" && Number.isFinite(raw.actualValue)
          ? raw.actualValue
          : ev.mode === "automated" && typeof ev.actualValue === "number"
            ? ev.actualValue
            : null;
      return {
        conditionId,
        label: typeof raw.label === "string" ? raw.label : null,
        state: ev.mode === "automated" ? ev.state : null,
        mode: ev.mode,
        threshold,
        actualValue,
        explanation: ev.explanation ?? null,
        paramsSnapshot: raw.paramsSnapshot
          ? asRecord(raw.paramsSnapshot)
          : null,
      };
    }
  );

  return {
    id: row.id,
    evaluatedAt: row.evaluatedAt.toISOString(),
    healthStatus: row.healthStatus,
    summary: row.summary,
    conditions,
  };
}

export async function listThesisHistoryForUser(
  userId: string,
  thesisId: string
): Promise<ThesisHistoryDto | null> {
  const thesis = await prisma.investmentThesis.findFirst({
    where: { id: thesisId, userId },
    select: { id: true, createdAt: true },
  });
  if (!thesis) return null;

  const d = revisionDelegate();
  const revisionRows = d
    ? await d.findMany({
        where: { thesisId },
        orderBy: { createdAt: "asc" },
        take: 200,
      })
    : [];

  const evaluations = await prisma.thesisEvaluation.findMany({
    where: { thesisId },
    orderBy: [{ evaluatedAt: "asc" }, { createdAt: "asc" }],
    take: 80,
    select: {
      id: true,
      evaluatedAt: true,
      healthStatus: true,
      summary: true,
      resultsJson: true,
    },
  });

  return {
    thesisId,
    createdAt: thesis.createdAt.toISOString(),
    revisions: revisionRows.map((r) => ({
      id: r.id,
      thesisId: r.thesisId,
      kind: r.kind as ThesisRevisionKind,
      summary: r.summary,
      payload: asRecord(r.payloadJson),
      createdAt: r.createdAt.toISOString(),
    })),
    evaluations: evaluations.map(parseEvaluationItem),
  };
}

/** Test helper — historical evals keep the snapshot threshold, not the live one. */
export function historicalThresholdsUnchanged(opts: {
  evaluations: ThesisEvaluationHistoryItem[];
  conditionId: string;
}): number[] {
  return opts.evaluations
    .flatMap((e) => e.conditions)
    .filter((c) => c.conditionId === opts.conditionId)
    .map((c) => c.threshold)
    .filter((t): t is number => t != null);
}
