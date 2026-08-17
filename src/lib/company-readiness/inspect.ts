import { prisma } from "../prisma.ts";
import type { ReadinessInspect } from "./types.ts";

export async function inspectSymbolDatasets(symbol: string): Promise<ReadinessInspect> {
  const sym = symbol.toUpperCase();
  const [
    metricCount,
    latestMetric,
    instrumentCount,
    latestInstrument,
    filingCount,
    latestFiling,
    insiderCount,
    latestInsider,
    ownerCount,
    latestOwner,
    instCount,
    latestInst,
    eventCount,
    latestEvent,
  ] = await Promise.all([
    prisma.metricObservation.count({ where: { symbol: sym } }),
    prisma.metricObservation.findFirst({
      where: { symbol: sym },
      orderBy: { filedAt: "desc" },
      select: { filedAt: true },
    }),
    prisma.dilutionInstrument.count({ where: { symbol: sym } }),
    prisma.dilutionInstrument.findFirst({
      where: { symbol: sym },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    prisma.filingSectionSnapshot.count({ where: { symbol: sym } }),
    prisma.filingSectionSnapshot.findFirst({
      where: { symbol: sym },
      orderBy: { filingDate: "desc" },
      select: { filingDate: true },
    }),
    prisma.insiderTransaction.count({ where: { symbol: sym } }),
    prisma.insiderTransaction.findFirst({
      where: { symbol: sym },
      orderBy: { filedAt: "desc" },
      select: { filedAt: true },
    }),
    prisma.beneficialOwnershipFiling.count({ where: { symbol: sym } }),
    prisma.beneficialOwnershipFiling.findFirst({
      where: { symbol: sym },
      orderBy: { filedAt: "desc" },
      select: { filedAt: true },
    }),
    prisma.institutionalHoldingSnapshot.count({ where: { symbol: sym } }),
    prisma.institutionalHoldingSnapshot.findFirst({
      where: { symbol: sym },
      orderBy: { reportDate: "desc" },
      select: { reportDate: true },
    }),
    prisma.companyEvent.count({ where: { symbol: sym } }),
    prisma.companyEvent.findFirst({
      where: { symbol: sym },
      orderBy: { occurredAt: "desc" },
      select: { occurredAt: true },
    }),
  ]);

  return {
    FINANCIALS: { rowCount: metricCount, dataAsOf: latestMetric?.filedAt ?? null },
    CAPITAL: {
      rowCount: instrumentCount,
      dataAsOf: latestInstrument?.updatedAt ?? null,
    },
    FILINGS: { rowCount: filingCount, dataAsOf: latestFiling?.filingDate ?? null },
    INSIDERS: { rowCount: insiderCount, dataAsOf: latestInsider?.filedAt ?? null },
    OWNERSHIP: { rowCount: ownerCount, dataAsOf: latestOwner?.filedAt ?? null },
    INSTITUTIONAL_13F: {
      rowCount: instCount,
      dataAsOf: latestInst?.reportDate ?? null,
    },
    COMPANY_EVENTS: {
      rowCount: eventCount,
      dataAsOf: latestEvent?.occurredAt ?? null,
    },
    COMPANY_STATE: {
      rowCount: metricCount,
      dataAsOf: latestMetric?.filedAt ?? null,
    },
  };
}
