/**
 * CapitalRiskSnapshot helpers — point-in-time rollup from DilutionInstrument rows.
 * Shelf capacity ≠ confirmed dilution. Status is factual capacity posture only.
 */

import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma.ts";
import type { CapitalRiskStatusLevel } from "../thesis/types.ts";
import { scheduleThesisHealthForSymbol } from "../thesis/health/schedule.ts";

export type CapitalRiskSnapshotBuild = {
  symbol: string;
  status: CapitalRiskStatusLevel;
  summary: string;
  metricsJson: Record<string, unknown>;
  instrumentIds: string[];
  asOf: Date;
  cik: string | null;
};

const ELEVATED_TYPES = new Set([
  "ATM_PROGRAM",
  "REGISTERED_DIRECT",
  "EQUITY_PURCHASE_AGREEMENT",
  "CONVERTIBLE_NOTE",
  "CONVERTIBLE_PREFERRED",
]);

const MODERATE_TYPES = new Set([
  "S3_SHELF",
  "S1_REGISTRATION",
  "PROSPECTUS_424B5",
  "WARRANT",
  "EFFECTIVE_REGISTRATION",
]);

/**
 * Pure rollup from instrument rows (tests + builders).
 */
export function buildCapitalRiskFromInstruments(opts: {
  symbol: string;
  instruments: Array<{
    id: string;
    instrumentType: string;
    status: string;
    potentialDilutionPct: number | null;
    estimateLabel: string;
    formType: string | null;
    cik: string | null;
  }>;
  asOf?: Date;
}): CapitalRiskSnapshotBuild {
  const asOf = opts.asOf ?? new Date();
  const active = opts.instruments.filter((i) => i.status === "active");
  const instrumentIds = active.map((i) => i.id);

  let status: CapitalRiskStatusLevel = "unknown";
  if (opts.instruments.length === 0) {
    status = "low";
  } else if (active.length === 0) {
    status = "low";
  } else if (active.some((i) => ELEVATED_TYPES.has(i.instrumentType))) {
    status = "elevated";
  } else if (active.some((i) => MODERATE_TYPES.has(i.instrumentType))) {
    status = "moderate";
  } else {
    status = "moderate";
  }

  const types = [...new Set(active.map((i) => i.instrumentType))];
  const summary =
    active.length === 0
      ? "No active capital instruments on file"
      : `Active capital instruments: ${types.join(", ")} (${active.length}). Shelf/registration capacity is not a confirmed sale.`;

  const cik = opts.instruments.find((i) => i.cik)?.cik ?? null;

  return {
    symbol: opts.symbol.trim().toUpperCase(),
    status,
    summary,
    metricsJson: {
      activeCount: active.length,
      instrumentTypes: types,
      maxPotentialDilutionPct: active.reduce<number | null>((acc, i) => {
        if (i.potentialDilutionPct == null) return acc;
        if (acc == null) return i.potentialDilutionPct;
        return Math.max(acc, i.potentialDilutionPct);
      }, null),
    },
    instrumentIds,
    asOf,
    cik,
  };
}

function fingerprintFor(build: CapitalRiskSnapshotBuild): string {
  const payload = [
    build.symbol,
    build.status,
    build.asOf.toISOString().slice(0, 13), // hour bucket — avoid spam
    [...build.instrumentIds].sort().join(","),
    build.summary,
  ].join("|");
  return createHash("sha256").update(payload).digest("hex").slice(0, 40);
}

/**
 * Upsert latest capital-risk snapshot for a symbol from DilutionInstrument rows.
 * Schedules Thesis Health when the rollup status/fingerprint changes.
 */
export async function refreshCapitalRiskSnapshotForSymbol(
  symbol: string,
  opts?: { scheduleHealth?: boolean }
): Promise<{ snapshotId: string; status: string; changed: boolean } | null> {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return null;

  const instruments = await prisma.dilutionInstrument.findMany({
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
    },
  });

  const build = buildCapitalRiskFromInstruments({
    symbol: sym,
    instruments,
  });
  const fingerprint = fingerprintFor(build);

  const existing = await prisma.capitalRiskSnapshot.findUnique({
    where: { fingerprint },
    select: { id: true, status: true },
  });
  if (existing) {
    return {
      snapshotId: existing.id,
      status: existing.status,
      changed: false,
    };
  }

  const prev = await prisma.capitalRiskSnapshot.findFirst({
    where: { symbol: sym },
    orderBy: [{ asOf: "desc" }],
    select: { status: true },
  });

  const row = await prisma.capitalRiskSnapshot.create({
    data: {
      symbol: build.symbol,
      cik: build.cik,
      asOf: build.asOf,
      status: build.status,
      summary: build.summary,
      metricsJson: build.metricsJson as Prisma.InputJsonValue,
      instrumentIds: build.instrumentIds,
      fingerprint,
    },
    select: { id: true, status: true },
  });

  const changed = !prev || prev.status !== row.status;
  if (changed && opts?.scheduleHealth !== false) {
    scheduleThesisHealthForSymbol(sym, "capital_risk_snapshot_changed");
  }

  return { snapshotId: row.id, status: row.status, changed: true };
}
