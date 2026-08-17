import { prisma } from "../prisma.ts";
import type { CompanyIdentityRecord, CompanyIdentityStore } from "./types.ts";

function toRecord(row: {
  symbol: string;
  name: string | null;
  cik: string | null;
  assetType: string;
  isActive: boolean;
  refreshedAt: Date;
}): CompanyIdentityRecord {
  return {
    symbol: row.symbol,
    name: row.name,
    cik: row.cik,
    assetType: row.assetType,
    isActive: row.isActive,
    refreshedAt: row.refreshedAt,
  };
}

export function createPrismaIdentityStore(): CompanyIdentityStore {
  return {
    async findBySymbol(symbol) {
      const row = await prisma.symbolMaster.findUnique({
        where: { symbol },
        select: {
          symbol: true,
          name: true,
          cik: true,
          assetType: true,
          isActive: true,
          refreshedAt: true,
        },
      });
      return row ? toRecord(row) : null;
    },
    async findByCik(cik) {
      const rows = await prisma.symbolMaster.findMany({
        where: { cik },
        select: {
          symbol: true,
          name: true,
          cik: true,
          assetType: true,
          isActive: true,
          refreshedAt: true,
        },
        take: 8,
      });
      return rows.map(toRecord);
    },
    async upsert(row) {
      const saved = await prisma.symbolMaster.upsert({
        where: { symbol: row.symbol },
        create: {
          symbol: row.symbol,
          name: row.name,
          cik: row.cik,
          assetType: row.assetType,
          exchange: null,
          isActive: row.isActive,
          refreshedAt: row.refreshedAt,
        },
        update: {
          name: row.name ?? undefined,
          cik: row.cik || undefined,
          assetType: row.assetType,
          isActive: row.isActive,
          refreshedAt: row.refreshedAt,
        },
        select: {
          symbol: true,
          name: true,
          cik: true,
          assetType: true,
          isActive: true,
          refreshedAt: true,
        },
      });
      return toRecord(saved);
    },
  };
}
