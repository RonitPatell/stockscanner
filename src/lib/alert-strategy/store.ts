import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.ts";
import { normalizeAlertStrategies } from "./normalize.ts";
import { bumpStrategyVersion, type StrategyVersionSnapshot } from "./versioning.ts";
import { validateStrategy } from "./validate.ts";
import type { AlertStrategy } from "./types.ts";

/**
 * Load strategies for a user — session-scoped ownership only.
 */
export async function loadUserStrategies(userId: string): Promise<AlertStrategy[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { alertStrategies: true },
  });
  return normalizeAlertStrategies(user?.alertStrategies);
}

/**
 * Explicit save of one strategy with version bump + immutable snapshot.
 * Never silently overwrites: requires expectedVersion when updating.
 */
export async function saveUserStrategy(opts: {
  userId: string;
  draft: AlertStrategy;
  expectedVersion?: number | null;
  changeNote?: string | null;
}): Promise<{
  ok: boolean;
  strategy?: AlertStrategy;
  strategies?: AlertStrategy[];
  error?: string;
  issues?: ReturnType<typeof validateStrategy>["issues"];
}> {
  const validation = validateStrategy(opts.draft);
  if (!validation.ok) {
    return { ok: false, error: "Validation failed", issues: validation.issues };
  }

  const current = await loadUserStrategies(opts.userId);
  const prev = current.find((s) => s.id === opts.draft.id) ?? null;

  const bumped = bumpStrategyVersion(prev, opts.draft, {
    expectedVersion: opts.expectedVersion,
    changeNote: opts.changeNote,
  });
  if (bumped.refused) {
    return { ok: false, error: bumped.refuseReason ?? "Version conflict" };
  }

  const nextList = prev
    ? current.map((s) => (s.id === bumped.strategy.id ? bumped.strategy : s))
    : [...current, bumped.strategy];

  await persistStrategiesAndVersion(opts.userId, nextList, bumped.snapshot);

  return { ok: true, strategy: bumped.strategy, strategies: nextList };
}

export async function replaceUserStrategies(opts: {
  userId: string;
  strategies: AlertStrategy[];
  changeNote?: string | null;
}): Promise<{ ok: boolean; strategies: AlertStrategy[]; error?: string }> {
  for (const s of opts.strategies) {
    const v = validateStrategy(s);
    if (!v.ok) {
      return {
        ok: false,
        strategies: [],
        error: `Invalid strategy “${s.name}”: ${v.issues
          .filter((i) => i.severity === "error")
          .map((i) => i.message)
          .join("; ")}`,
      };
    }
  }

  const current = await loadUserStrategies(opts.userId);
  const next: AlertStrategy[] = [];
  const snapshots: StrategyVersionSnapshot[] = [];

  for (const draft of opts.strategies) {
    const prev = current.find((s) => s.id === draft.id) ?? null;
    // Import/replace: if same id exists, bump; else start at draft.version or 1
    const bumped = bumpStrategyVersion(prev, draft, {
      expectedVersion: prev ? prev.version : null,
      changeNote: opts.changeNote ?? "bulk replace",
    });
    if (bumped.refused) {
      // Force new id path shouldn't refuse without expectedVersion — if refused, keep draft as new version from prev
      return {
        ok: false,
        strategies: [],
        error: bumped.refuseReason ?? "Version conflict during replace",
      };
    }
    next.push(bumped.strategy);
    snapshots.push(bumped.snapshot);
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: opts.userId },
      data: { alertStrategies: next as unknown as Prisma.InputJsonValue },
      select: { id: true },
    });
    for (const snap of snapshots) {
      await tx.alertStrategyVersion.create({
        data: {
          userId: opts.userId,
          strategyId: snap.strategyId,
          version: snap.version,
          schemaVersion: snap.schemaVersion,
          contentHash: snap.contentHash,
          snapshot: snap.snapshot as unknown as Prisma.InputJsonValue,
          changeNote: snap.changeNote ?? null,
          savedAt: new Date(snap.savedAt),
        },
      });
    }
  });

  return { ok: true, strategies: next };
}

export async function deleteUserStrategy(
  userId: string,
  strategyId: string
): Promise<{ ok: boolean; strategies: AlertStrategy[] }> {
  const current = await loadUserStrategies(userId);
  const next = current.filter((s) => s.id !== strategyId);
  await prisma.user.update({
    where: { id: userId },
    data: { alertStrategies: next as unknown as Prisma.InputJsonValue },
    select: { id: true },
  });
  return { ok: true, strategies: next };
}

export async function listStrategyVersions(
  userId: string,
  strategyId: string
): Promise<
  Array<{
    version: number;
    contentHash: string;
    savedAt: string;
    changeNote: string | null;
  }>
> {
  const rows = await prisma.alertStrategyVersion.findMany({
    where: { userId, strategyId },
    orderBy: { version: "desc" },
    take: 50,
    select: {
      version: true,
      contentHash: true,
      savedAt: true,
      changeNote: true,
    },
  });
  return rows.map((r) => ({
    version: r.version,
    contentHash: r.contentHash,
    savedAt: r.savedAt.toISOString(),
    changeNote: r.changeNote,
  }));
}

async function persistStrategiesAndVersion(
  userId: string,
  strategies: AlertStrategy[],
  snapshot: StrategyVersionSnapshot
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        alertStrategies: strategies as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    await tx.alertStrategyVersion.create({
      data: {
        userId,
        strategyId: snapshot.strategyId,
        version: snapshot.version,
        schemaVersion: snapshot.schemaVersion,
        contentHash: snapshot.contentHash,
        snapshot: snapshot.snapshot as unknown as Prisma.InputJsonValue,
        changeNote: snapshot.changeNote ?? null,
        savedAt: new Date(snapshot.savedAt),
      },
    });
  });
}
