/**
 * Emit CompanyEvent when Capital Risk level changes.
 */

import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma.ts";
import type { CapitalRiskStatusLevel } from "../thesis/types.ts";
import { capitalRiskStatusLabel } from "./types.ts";

function fingerprint(symbol: string, from: string, to: string, asOfDay: string): string {
  return createHash("sha256")
    .update(`capital_risk_level_change|${symbol}|${from}|${to}|${asOfDay}`)
    .digest("hex")
    .slice(0, 48);
}

/**
 * Persist a derived capital_risk_level_change event (idempotent).
 */
export async function emitCapitalRiskLevelChangeEvent(opts: {
  symbol: string;
  cik?: string | null;
  previousStatus: string | null;
  nextStatus: CapitalRiskStatusLevel;
  summary: string;
  reasonCodes: string[];
  snapshotId: string;
  asOf: Date;
}): Promise<{ emitted: boolean; eventId?: string }> {
  const sym = opts.symbol.trim().toUpperCase();
  const prev = opts.previousStatus ?? "none";
  if (prev === opts.nextStatus) {
    return { emitted: false };
  }

  const asOfDay = opts.asOf.toISOString().slice(0, 10);
  const fp = fingerprint(sym, prev, opts.nextStatus, asOfDay);

  const title = `${capitalRiskStatusLabel(opts.nextStatus)} (${sym})`;
  const summary = [
    prev === "none"
      ? `Capital risk classified as ${opts.nextStatus}.`
      : `Capital risk changed from ${prev} to ${opts.nextStatus}.`,
    opts.summary,
    "Not a prediction that the company will issue shares.",
  ].join(" ");

  const severity =
    opts.nextStatus === "elevated"
      ? "material"
      : opts.nextStatus === "moderate"
        ? "notable"
        : opts.nextStatus === "low"
          ? "info"
          : "unknown";

  const evidenceJson = {
    previousStatus: opts.previousStatus,
    nextStatus: opts.nextStatus,
    reasonCodes: opts.reasonCodes,
    snapshotId: opts.snapshotId,
    engine: "capital-risk",
  };

  const row = await prisma.companyEvent.upsert({
    where: { fingerprint: fp },
    create: {
      symbol: sym,
      cik: opts.cik ?? null,
      category: "capital",
      eventType: "capital_risk_level_change",
      severity,
      title,
      summary,
      occurredAt: opts.asOf,
      sourceType: "derived",
      sourceId: opts.snapshotId,
      sourceUrl: null,
      evidenceJson: evidenceJson as Prisma.InputJsonValue,
      fingerprint: fp,
    },
    update: {
      title,
      summary,
      severity,
      evidenceJson: evidenceJson as Prisma.InputJsonValue,
      occurredAt: opts.asOf,
    },
    select: { id: true, fingerprint: true },
  });

  void import("../monitoring-alerts/dispatch.ts")
    .then(({ scheduleCompanyEventAlertDispatch }) => {
      scheduleCompanyEventAlertDispatch({
        id: row.id,
        symbol: sym,
        category: "capital",
        eventType: "capital_risk_level_change",
        title,
        summary,
        sourceType: "derived",
        sourceUrl: null,
        fingerprint: fp,
        evidenceJson,
        occurredAt: opts.asOf,
      });
    })
    .catch(() => {});

  return { emitted: true, eventId: row.id };
}
