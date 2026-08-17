/**
 * Persist CapitalRiskSnapshot from full evaluation (instruments + metrics).
 */

import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma.ts";
import { scheduleThesisHealthForSymbol } from "../thesis/health/schedule.ts";
import {
  buildCapitalRiskFromInstruments,
  evaluateCapitalRisk,
} from "./evaluate.ts";
import { emitCapitalRiskLevelChangeEvent } from "./events.ts";
import type { CapitalRiskReport } from "./types.ts";
import { CAPITAL_RISK_ENGINE_VERSION } from "./types.ts";

export { buildCapitalRiskFromInstruments };

function fingerprintFor(opts: {
  symbol: string;
  status: string;
  reasonCodes: string[];
  instrumentIds: string[];
  asOfHour: string;
}): string {
  const payload = [
    opts.symbol,
    opts.status,
    opts.asOfHour,
    [...opts.reasonCodes].sort().join(","),
    [...opts.instrumentIds].sort().join(","),
    CAPITAL_RISK_ENGINE_VERSION,
  ].join("|");
  return createHash("sha256").update(payload).digest("hex").slice(0, 40);
}

async function loadInputs(symbol: string) {
  const sym = symbol.trim().toUpperCase();
  const [instruments, observations, conflicts] = await Promise.all([
    prisma.dilutionInstrument.findMany({
      where: { symbol: sym },
      orderBy: [{ updatedAt: "desc" }],
      take: 80,
      select: {
        id: true,
        instrumentType: true,
        status: true,
        potentialDilutionPct: true,
        estimateLabel: true,
        formType: true,
        cik: true,
        filingDate: true,
        createdAt: true,
        sourceUrl: true,
        accessionNumber: true,
        capacityKind: true,
        confidence: true,
        conflictNote: true,
        needsManualReview: true,
      },
    }),
    prisma.metricObservation.findMany({
      where: {
        symbol: sym,
        metricKey: {
          in: [
            "cash",
            "operating_cash_flow",
            "shares_outstanding",
            "diluted_shares",
          ],
        },
      },
      orderBy: [{ periodEnd: "desc" }],
      take: 120,
      select: {
        metricKey: true,
        value: true,
        periodStart: true,
        periodEnd: true,
        fiscalYear: true,
        fiscalPeriod: true,
        sourceUrl: true,
        filedAt: true,
        fingerprint: true,
      },
    }),
    prisma.dilutionConflict.count({
      where: { symbol: sym, resolved: false },
    }),
  ]);

  return { instruments, observations, hasConflicts: conflicts > 0 };
}

/**
 * Build + persist CapitalRiskSnapshot. Emits CompanyEvent on status change.
 */
export async function refreshCapitalRiskSnapshotForSymbol(
  symbol: string,
  opts?: { scheduleHealth?: boolean; emitEvent?: boolean }
): Promise<{
  snapshotId: string;
  status: string;
  changed: boolean;
  report: CapitalRiskReport;
} | null> {
  try {
    return await refreshCapitalRiskSnapshotForSymbolInner(symbol, opts);
  } catch (err) {
    void import("../ops/index.ts")
      .then(({ opsFail, incrOpsCounter }) => {
        opsFail("capital_risk", "snapshot_refresh_failed", err, {
          symbol: symbol.trim().toUpperCase(),
        });
        return incrOpsCounter("capital_risk_fail");
      })
      .catch(() => {});
    throw err;
  }
}

async function refreshCapitalRiskSnapshotForSymbolInner(
  symbol: string,
  opts?: { scheduleHealth?: boolean; emitEvent?: boolean }
): Promise<{
  snapshotId: string;
  status: string;
  changed: boolean;
  report: CapitalRiskReport;
} | null> {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return null;

  const { instruments, observations, hasConflicts } = await loadInputs(sym);
  const evaluated = evaluateCapitalRisk({
    symbol: sym,
    instruments,
    observations,
    hasInstrumentConflicts: hasConflicts,
  });

  const asOf = new Date(evaluated.asOf);
  const fp = fingerprintFor({
    symbol: sym,
    status: evaluated.status,
    reasonCodes: evaluated.reasonCodes,
    instrumentIds: evaluated.instrumentIds,
    asOfHour: asOf.toISOString().slice(0, 13),
  });

  const existing = await prisma.capitalRiskSnapshot.findUnique({
    where: { fingerprint: fp },
    select: { id: true, status: true },
  });

  const metricsJson = {
    version: evaluated.version,
    reasonCodes: evaluated.reasonCodes,
    reasons: evaluated.reasons,
    liquidity: evaluated.liquidity,
    shareStructure: evaluated.shareStructure,
    statusLabel: evaluated.statusLabel,
  };

  const { cik: _cik, ...reportBase } = evaluated;

  if (existing) {
    void import("../ops/index.ts")
      .then(({ recordOpsStamp }) =>
        recordOpsStamp("capital_risk_ok", {
          symbol: sym,
          status: existing.status,
          changed: false,
        })
      )
      .catch(() => {});
    return {
      snapshotId: existing.id,
      status: existing.status,
      changed: false,
      report: { ...reportBase, snapshotId: existing.id },
    };
  }

  const prev = await prisma.capitalRiskSnapshot.findFirst({
    where: { symbol: sym },
    orderBy: [{ asOf: "desc" }],
    select: { status: true },
  });

  const row = await prisma.capitalRiskSnapshot.create({
    data: {
      symbol: evaluated.symbol,
      cik: evaluated.cik,
      asOf,
      status: evaluated.status,
      summary: evaluated.summary,
      metricsJson: metricsJson as Prisma.InputJsonValue,
      instrumentIds: evaluated.instrumentIds,
      fingerprint: fp,
    },
    select: { id: true, status: true },
  });

  const changed = !prev || prev.status !== row.status;

  if (changed && opts?.emitEvent !== false) {
    await emitCapitalRiskLevelChangeEvent({
      symbol: sym,
      cik: evaluated.cik,
      previousStatus: prev?.status ?? null,
      nextStatus: evaluated.status,
      summary: evaluated.summary,
      reasonCodes: evaluated.reasonCodes,
      snapshotId: row.id,
      asOf,
    }).catch(() => {});
  }

  if (changed && opts?.scheduleHealth !== false) {
    scheduleThesisHealthForSymbol(sym, "capital_risk_snapshot_changed");
  }

  void import("../ops/index.ts")
    .then(({ recordOpsStamp }) =>
      recordOpsStamp("capital_risk_ok", {
        symbol: sym,
        status: row.status,
        changed,
      })
    )
    .catch(() => {});

  return {
    snapshotId: row.id,
    status: row.status,
    changed: true,
    report: { ...reportBase, snapshotId: row.id },
  };
}

/** Load Capital Risk report for a symbol (live evaluation + latest snapshot id). */
export async function getCapitalRiskReportForSymbol(
  symbol: string
): Promise<CapitalRiskReport> {
  try {
    const sym = symbol.trim().toUpperCase();
    const { instruments, observations, hasConflicts } = await loadInputs(sym);
    const evaluated = evaluateCapitalRisk({
      symbol: sym,
      instruments,
      observations,
      hasInstrumentConflicts: hasConflicts,
    });

    const latest = await prisma.capitalRiskSnapshot.findFirst({
      where: { symbol: sym },
      orderBy: [{ asOf: "desc" }],
      select: { id: true },
    });

    const { cik: _cik, ...reportBase } = evaluated;
    void import("../ops/index.ts")
      .then(({ recordOpsStamp }) =>
        recordOpsStamp("capital_risk_ok", { symbol: sym, status: evaluated.status })
      )
      .catch(() => {});
    return { ...reportBase, snapshotId: latest?.id ?? null };
  } catch (err) {
    void import("../ops/index.ts")
      .then(({ opsFail, incrOpsCounter }) => {
        opsFail("capital_risk", "report_failed", err, {
          symbol: symbol.trim().toUpperCase(),
        });
        return incrOpsCounter("capital_risk_fail");
      })
      .catch(() => {});
    throw err;
  }
}
