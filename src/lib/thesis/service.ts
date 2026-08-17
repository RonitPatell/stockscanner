/**
 * Thesis Monitoring service — private per session userId.
 * One active thesis per user+symbol (unique). Not investment advice.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma.ts";
import { normalizePortfolioSymbol } from "../portfolio/symbols.ts";
import type {
  CreateThesisBody,
  ThesisConditionInput,
  UpdateConditionBody,
  UpdateThesisBody,
} from "./schemas.ts";
import { getLatestThesisEvaluation } from "./health/persist.ts";
import { parseHealthResultsJson } from "./health/parse-results.ts";
import { scheduleThesisHealthForThesis } from "./health/schedule.ts";
import {
  isAutomatedConditionType,
  type ThesisConditionEvaluationDto,
  type ThesisConditionType,
  type ThesisHealthStatus,
  type ThesisHealthSummaryDto,
  type ThesisStatus,
} from "./types.ts";

export type ThesisConditionDto = {
  id: string;
  conditionType: ThesisConditionType;
  label: string;
  polarity: string;
  params: Record<string, unknown>;
  sortOrder: number;
  evaluation: ThesisConditionEvaluationDto;
  createdAt: string;
  updatedAt: string;
};

export type ThesisDto = {
  id: string;
  symbol: string;
  title: string | null;
  /** User-authored general note (DB: premise). */
  note: string | null;
  status: ThesisStatus;
  healthStatus: ThesisHealthStatus;
  lastEvaluatedAt: string | null;
  /** Counts from latest persisted evaluation — not a stock score. */
  healthSummary: ThesisHealthSummaryDto | null;
  createdAt: string;
  updatedAt: string;
  conditions: ThesisConditionDto[];
};

type ConditionRow = {
  id: string;
  conditionType: string;
  label: string;
  polarity: string;
  paramsJson: unknown;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

type ThesisRow = {
  id: string;
  symbol: string;
  title: string | null;
  premise: string | null;
  status: string;
  healthStatus: string;
  lastEvaluatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  conditions: ConditionRow[];
};

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return {};
}

function evaluationForType(
  conditionType: string,
  overlay?: ThesisConditionEvaluationDto
): ThesisConditionEvaluationDto {
  if (overlay) return overlay;
  if (conditionType === "CUSTOM_MANUAL") {
    return {
      mode: "manual",
      state: null,
      explanation: "Manual condition — not auto-evaluated",
    };
  }
  return {
    mode: "automated",
    state: "UNKNOWN",
    explanation: "Not yet evaluated",
    evidence: { sourceType: "none", label: "Awaiting Thesis Health evaluation" },
  };
}

function conditionToDto(
  row: ConditionRow,
  overlay?: ThesisConditionEvaluationDto
): ThesisConditionDto {
  const conditionType = row.conditionType as ThesisConditionType;
  return {
    id: row.id,
    conditionType,
    label: row.label,
    polarity: row.polarity,
    params: asRecord(row.paramsJson),
    sortOrder: row.sortOrder,
    evaluation: evaluationForType(row.conditionType, overlay),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function thesisToDto(
  row: ThesisRow,
  health?: {
    byConditionId: Map<string, ThesisConditionEvaluationDto>;
    summary: ThesisHealthSummaryDto | null;
  }
): ThesisDto {
  const conditions = [...row.conditions]
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a.createdAt.getTime() - b.createdAt.getTime()
    )
    .map((c) => conditionToDto(c, health?.byConditionId.get(c.id)));
  return {
    id: row.id,
    symbol: row.symbol,
    title: row.title,
    note: row.premise,
    status: row.status as ThesisStatus,
    healthStatus: row.healthStatus as ThesisHealthStatus,
    lastEvaluatedAt: row.lastEvaluatedAt?.toISOString() ?? null,
    healthSummary: health?.summary ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    conditions,
  };
}

async function thesisToDtoWithHealth(row: ThesisRow): Promise<ThesisDto> {
  const latest = await getLatestThesisEvaluation(row.id);
  if (!latest) return thesisToDto(row);
  const parsed = parseHealthResultsJson(latest.resultsJson);
  return thesisToDto(row, {
    byConditionId: parsed.byConditionId,
    summary: parsed.summary,
  });
}

const THESIS_INCLUDE = {
  conditions: {
    orderBy: [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }],
  },
};

export type ThesisMutationResult =
  | { ok: true; thesis: ThesisDto }
  | {
      ok: false;
      code: "NOT_FOUND" | "DUPLICATE" | "INVALID" | "FORBIDDEN";
      error: string;
    };

export type ConditionMutationResult =
  | { ok: true; thesis: ThesisDto; conditionId: string }
  | {
      ok: false;
      code: "NOT_FOUND" | "INVALID" | "FORBIDDEN";
      error: string;
    };

async function loadOwnedThesis(
  userId: string,
  thesisId: string
): Promise<ThesisRow | null> {
  return prisma.investmentThesis.findFirst({
    where: { id: thesisId, userId },
    include: THESIS_INCLUDE,
  });
}

export async function listThesesForUser(
  userId: string,
  opts?: { symbol?: string; status?: ThesisStatus }
): Promise<ThesisDto[]> {
  const symbol = opts?.symbol
    ? normalizePortfolioSymbol(opts.symbol) ?? opts.symbol
    : undefined;
  const rows = await prisma.investmentThesis.findMany({
    where: {
      userId,
      ...(symbol ? { symbol } : {}),
      ...(opts?.status ? { status: opts.status } : {}),
    },
    orderBy: [{ updatedAt: "desc" }],
    include: THESIS_INCLUDE,
  });
  return Promise.all(rows.map((row) => thesisToDtoWithHealth(row)));
}

export async function getThesisForUser(
  userId: string,
  thesisId: string
): Promise<ThesisMutationResult> {
  const row = await loadOwnedThesis(userId, thesisId);
  if (!row) {
    return { ok: false, code: "NOT_FOUND", error: "Thesis not found" };
  }
  return { ok: true, thesis: await thesisToDtoWithHealth(row) };
}

export async function getThesisBySymbolForUser(
  userId: string,
  symbolRaw: string
): Promise<ThesisDto | null> {
  const symbol = normalizePortfolioSymbol(symbolRaw);
  if (!symbol) return null;
  const row = await prisma.investmentThesis.findUnique({
    where: { userId_symbol: { userId, symbol } },
    include: THESIS_INCLUDE,
  });
  return row ? thesisToDtoWithHealth(row) : null;
}

function resolveNote(
  body: { note?: string | null; premise?: string | null }
): string | null | undefined {
  if (body.note !== undefined) return body.note;
  if (body.premise !== undefined) return body.premise;
  return undefined;
}

export async function createThesisForUser(
  userId: string,
  body: CreateThesisBody
): Promise<ThesisMutationResult> {
  const symbol = normalizePortfolioSymbol(body.symbol);
  if (!symbol) {
    return { ok: false, code: "INVALID", error: "Invalid ticker symbol" };
  }

  const existing = await prisma.investmentThesis.findUnique({
    where: { userId_symbol: { userId, symbol } },
    select: { id: true, status: true },
  });
  if (existing && existing.status !== "archived") {
    return {
      ok: false,
      code: "DUPLICATE",
      error: `A thesis already exists for ${symbol}`,
    };
  }

  const note = resolveNote(body) ?? null;
  const conditions = body.conditions ?? [];

  try {
    if (existing && existing.status === "archived") {
      // Revive archived thesis instead of unique conflict
      const row = await prisma.$transaction(async (tx) => {
        await tx.thesisCondition.deleteMany({
          where: { thesisId: existing.id },
        });
        await tx.thesisEvaluation.deleteMany({
          where: { thesisId: existing.id },
        });
        await tx.investmentThesis.update({
          where: { id: existing.id },
          data: {
            title: body.title ?? null,
            premise: note,
            status: body.status ?? "active",
            healthStatus: "unknown",
            lastEvaluatedAt: null,
          },
        });
        if (conditions.length) {
          await tx.thesisCondition.createMany({
            data: conditions.map((c, i) => ({
              thesisId: existing.id,
              conditionType: c.conditionType,
              label: c.label,
              polarity: c.polarity,
              paramsJson: c.params as Prisma.InputJsonValue,
              sortOrder: i,
            })),
          });
        }
        return tx.investmentThesis.findFirstOrThrow({
          where: { id: existing.id, userId },
          include: THESIS_INCLUDE,
        });
      });
      scheduleThesisHealthForThesis(row.id, "thesis_created");
      return { ok: true, thesis: await thesisToDtoWithHealth(row) };
    }

    const row = await prisma.investmentThesis.create({
      data: {
        userId,
        symbol,
        title: body.title ?? null,
        premise: note,
        status: body.status ?? "active",
        healthStatus: "unknown",
        conditions: conditions.length
          ? {
              create: conditions.map((c, i) => ({
                conditionType: c.conditionType,
                label: c.label,
                polarity: c.polarity,
                paramsJson: c.params as Prisma.InputJsonValue,
                sortOrder: i,
              })),
            }
          : undefined,
      },
      include: THESIS_INCLUDE,
    });
    scheduleThesisHealthForThesis(row.id, "thesis_created");
    return { ok: true, thesis: await thesisToDtoWithHealth(row) };
  } catch (e) {
    const code =
      e && typeof e === "object" && "code" in e
        ? String((e as { code: unknown }).code)
        : "";
    if (code === "P2002") {
      return {
        ok: false,
        code: "DUPLICATE",
        error: `A thesis already exists for ${symbol}`,
      };
    }
    throw e;
  }
}

export async function updateThesisForUser(
  userId: string,
  thesisId: string,
  body: UpdateThesisBody
): Promise<ThesisMutationResult> {
  const existing = await prisma.investmentThesis.findFirst({
    where: { id: thesisId, userId },
    select: { id: true },
  });
  if (!existing) {
    return { ok: false, code: "NOT_FOUND", error: "Thesis not found" };
  }

  const note = resolveNote(body);
  const row = await prisma.investmentThesis.update({
    where: { id: existing.id },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(note !== undefined ? { premise: note } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
    },
    include: THESIS_INCLUDE,
  });
  return { ok: true, thesis: await thesisToDtoWithHealth(row) };
}

export async function deleteThesisForUser(
  userId: string,
  thesisId: string
): Promise<
  | { ok: true; deleted: true }
  | { ok: false; code: "NOT_FOUND"; error: string }
> {
  const existing = await prisma.investmentThesis.findFirst({
    where: { id: thesisId, userId },
    select: { id: true },
  });
  if (!existing) {
    return { ok: false, code: "NOT_FOUND", error: "Thesis not found" };
  }
  await prisma.investmentThesis.delete({ where: { id: existing.id } });
  return { ok: true, deleted: true };
}

export async function addConditionForUser(
  userId: string,
  thesisId: string,
  input: ThesisConditionInput
): Promise<ConditionMutationResult> {
  const thesis = await prisma.investmentThesis.findFirst({
    where: { id: thesisId, userId },
    select: { id: true },
  });
  if (!thesis) {
    return { ok: false, code: "NOT_FOUND", error: "Thesis not found" };
  }

  const count = await prisma.thesisCondition.count({
    where: { thesisId: thesis.id },
  });
  if (count >= 40) {
    return {
      ok: false,
      code: "INVALID",
      error: "Maximum of 40 conditions per thesis",
    };
  }

  const created = await prisma.thesisCondition.create({
    data: {
      thesisId: thesis.id,
      conditionType: input.conditionType,
      label: input.label,
      polarity: input.polarity,
      paramsJson: input.params as Prisma.InputJsonValue,
      sortOrder: count,
    },
    select: { id: true },
  });

  const row = await loadOwnedThesis(userId, thesis.id);
  if (!row) {
    return { ok: false, code: "NOT_FOUND", error: "Thesis not found" };
  }
  scheduleThesisHealthForThesis(thesis.id, "condition_added");
  return {
    ok: true,
    thesis: await thesisToDtoWithHealth(row),
    conditionId: created.id,
  };
}

export async function updateConditionForUser(
  userId: string,
  thesisId: string,
  conditionId: string,
  body: UpdateConditionBody
): Promise<ConditionMutationResult> {
  const thesis = await prisma.investmentThesis.findFirst({
    where: { id: thesisId, userId },
    select: { id: true },
  });
  if (!thesis) {
    return { ok: false, code: "NOT_FOUND", error: "Thesis not found" };
  }

  const existing = await prisma.thesisCondition.findFirst({
    where: { id: conditionId, thesisId: thesis.id },
  });
  if (!existing) {
    return { ok: false, code: "NOT_FOUND", error: "Condition not found" };
  }

  const nextType =
    (body.conditionType as ThesisConditionType | undefined) ??
    (existing.conditionType as ThesisConditionType);

  let nextParams: Record<string, unknown> | undefined;
  if (body.conditionType !== undefined || body.params !== undefined) {
    // Schemas require conditionType when params change; route validates.
    const { thesisConditionParamsByType } = await import("./schemas.ts");
    const schema = thesisConditionParamsByType[nextType];
    nextParams = schema.parse(body.params ?? {}) as Record<string, unknown>;
  }

  await prisma.thesisCondition.update({
    where: { id: existing.id },
    data: {
      ...(body.conditionType !== undefined
        ? { conditionType: body.conditionType }
        : {}),
      ...(body.label !== undefined ? { label: body.label } : {}),
      ...(body.polarity !== undefined ? { polarity: body.polarity } : {}),
      ...(nextParams !== undefined
        ? { paramsJson: nextParams as Prisma.InputJsonValue }
        : {}),
    },
  });

  // Sanity: manual vs automated evaluation mode follows type
  if (body.conditionType && !isAutomatedConditionType(body.conditionType)) {
    /* CUSTOM_MANUAL — evaluation DTO is derived at read time */
  }

  const row = await loadOwnedThesis(userId, thesis.id);
  if (!row) {
    return { ok: false, code: "NOT_FOUND", error: "Thesis not found" };
  }
  scheduleThesisHealthForThesis(thesis.id, "condition_edited");
  return {
    ok: true,
    thesis: await thesisToDtoWithHealth(row),
    conditionId: existing.id,
  };
}

export async function deleteConditionForUser(
  userId: string,
  thesisId: string,
  conditionId: string
): Promise<ConditionMutationResult> {
  const thesis = await prisma.investmentThesis.findFirst({
    where: { id: thesisId, userId },
    select: { id: true },
  });
  if (!thesis) {
    return { ok: false, code: "NOT_FOUND", error: "Thesis not found" };
  }

  const existing = await prisma.thesisCondition.findFirst({
    where: { id: conditionId, thesisId: thesis.id },
    select: { id: true },
  });
  if (!existing) {
    return { ok: false, code: "NOT_FOUND", error: "Condition not found" };
  }

  await prisma.thesisCondition.delete({ where: { id: existing.id } });

  // Compact sortOrder
  const remaining = await prisma.thesisCondition.findMany({
    where: { thesisId: thesis.id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  await prisma.$transaction(
    remaining.map((c, i) =>
      prisma.thesisCondition.update({
        where: { id: c.id },
        data: { sortOrder: i },
      })
    )
  );

  const row = await loadOwnedThesis(userId, thesis.id);
  if (!row) {
    return { ok: false, code: "NOT_FOUND", error: "Thesis not found" };
  }
  scheduleThesisHealthForThesis(thesis.id, "condition_deleted");
  return {
    ok: true,
    thesis: await thesisToDtoWithHealth(row),
    conditionId: existing.id,
  };
}

export async function reorderConditionsForUser(
  userId: string,
  thesisId: string,
  orderedIds: string[]
): Promise<ThesisMutationResult> {
  const thesis = await prisma.investmentThesis.findFirst({
    where: { id: thesisId, userId },
    select: { id: true },
  });
  if (!thesis) {
    return { ok: false, code: "NOT_FOUND", error: "Thesis not found" };
  }

  const existing = await prisma.thesisCondition.findMany({
    where: { thesisId: thesis.id },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((c) => c.id));
  if (orderedIds.length !== existingIds.size) {
    return {
      ok: false,
      code: "INVALID",
      error: "orderedIds must include every condition exactly once",
    };
  }
  for (const id of orderedIds) {
    if (!existingIds.has(id)) {
      return {
        ok: false,
        code: "INVALID",
        error: "orderedIds contains an unknown condition",
      };
    }
  }
  if (new Set(orderedIds).size !== orderedIds.length) {
    return {
      ok: false,
      code: "INVALID",
      error: "orderedIds must be unique",
    };
  }

  await prisma.$transaction(
    orderedIds.map((id, i) =>
      prisma.thesisCondition.update({
        where: { id },
        data: { sortOrder: i },
      })
    )
  );

  const row = await loadOwnedThesis(userId, thesis.id);
  if (!row) {
    return { ok: false, code: "NOT_FOUND", error: "Thesis not found" };
  }
  return { ok: true, thesis: await thesisToDtoWithHealth(row) };
}
