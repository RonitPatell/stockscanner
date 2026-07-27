import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.ts";
import type { TradeabilityResult } from "./types.ts";
import { saveTradeabilityResult } from "./store.ts";

type TradeabilityDb = {
  tradeabilitySnapshot: {
    create: (args: {
      data: Record<string, unknown>;
      select: { id: true };
    }) => Promise<{ id: string }>;
  };
  tradeabilityTransition: {
    create: (args: {
      data: Record<string, unknown>;
      select: { id: true };
    }) => Promise<{ id: string }>;
  };
};

export async function persistTradeabilityResult(
  result: TradeabilityResult
): Promise<{ snapshotId: string | null; transitionId: string | null }> {
  await saveTradeabilityResult(result);

  try {
    const db = prisma as unknown as TradeabilityDb;
    const snap = await db.tradeabilitySnapshot.create({
      data: {
        symbol: result.symbol,
        engineVersion: result.engineVersion,
        class: result.class,
        previousClass: result.previousClass,
        flappedSuppressed: result.flappedSuppressed,
        explanation: result.explanation.slice(0, 2000),
        metricsJson: result.metrics as unknown as Prisma.InputJsonValue,
        warningsJson: result.warnings as unknown as Prisma.InputJsonValue,
        rulesJson: result.rules as unknown as Prisma.InputJsonValue,
        slippageJson: result.illustrativeSlippage as unknown as Prisma.InputJsonValue,
        missingInputs: result.metrics.missingInputs,
        marketSession: result.metrics.marketSession,
      },
      select: { id: true },
    });

    let transitionId: string | null = null;
    if (
      result.previousClass &&
      result.previousClass !== result.class &&
      !result.flappedSuppressed
    ) {
      const t = await db.tradeabilityTransition.create({
        data: {
          symbol: result.symbol,
          fromClass: result.previousClass,
          toClass: result.class,
          engineVersion: result.engineVersion,
          explanation: result.explanation.slice(0, 500),
        },
        select: { id: true },
      });
      transitionId = t.id;
    }

    return { snapshotId: snap.id, transitionId };
  } catch {
    return { snapshotId: null, transitionId: null };
  }
}
