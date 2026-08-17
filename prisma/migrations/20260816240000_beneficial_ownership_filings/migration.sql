-- CreateTable: BeneficialOwnershipFiling — structured 13D/13G extracts
CREATE TABLE IF NOT EXISTS "BeneficialOwnershipFiling" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "cik" TEXT,
    "accessionNumber" TEXT NOT NULL,
    "formType" TEXT NOT NULL,
    "isAmendment" BOOLEAN NOT NULL DEFAULT false,
    "filedAt" TIMESTAMP(3) NOT NULL,
    "filerName" TEXT NOT NULL,
    "filerCik" TEXT,
    "issuerName" TEXT,
    "percentOwned" DOUBLE PRECISION,
    "sharesOwned" DOUBLE PRECISION,
    "previousPercent" DOUBLE PRECISION,
    "previousShares" DOUBLE PRECISION,
    "previousAccession" TEXT,
    "percentChange" DOUBLE PRECISION,
    "structuredKind" TEXT NOT NULL DEFAULT 'none',
    "summaryText" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "parseStatus" TEXT NOT NULL DEFAULT 'ok',
    "sourceUrl" TEXT,
    "fingerprint" TEXT NOT NULL,
    "companyEventId" TEXT,
    "metricsJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BeneficialOwnershipFiling_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BeneficialOwnershipFiling_fingerprint_key"
  ON "BeneficialOwnershipFiling"("fingerprint");

CREATE INDEX IF NOT EXISTS "BeneficialOwnershipFiling_symbol_filedAt_idx"
  ON "BeneficialOwnershipFiling"("symbol", "filedAt");

CREATE INDEX IF NOT EXISTS "BeneficialOwnershipFiling_symbol_filerName_filedAt_idx"
  ON "BeneficialOwnershipFiling"("symbol", "filerName", "filedAt");

CREATE INDEX IF NOT EXISTS "BeneficialOwnershipFiling_accessionNumber_idx"
  ON "BeneficialOwnershipFiling"("accessionNumber");

CREATE INDEX IF NOT EXISTS "BeneficialOwnershipFiling_companyEventId_idx"
  ON "BeneficialOwnershipFiling"("companyEventId");
