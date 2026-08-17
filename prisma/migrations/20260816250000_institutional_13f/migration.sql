-- InstitutionalHoldingSnapshot: change tracking + issuer name
ALTER TABLE "InstitutionalHoldingSnapshot" ADD COLUMN IF NOT EXISTS "issuerName" TEXT;
ALTER TABLE "InstitutionalHoldingSnapshot" ADD COLUMN IF NOT EXISTS "changeKind" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "InstitutionalHoldingSnapshot" ADD COLUMN IF NOT EXISTS "priorShares" DOUBLE PRECISION;
ALTER TABLE "InstitutionalHoldingSnapshot" ADD COLUMN IF NOT EXISTS "priorValueUsd" DOUBLE PRECISION;
ALTER TABLE "InstitutionalHoldingSnapshot" ADD COLUMN IF NOT EXISTS "priorReportDate" TIMESTAMP(3);
ALTER TABLE "InstitutionalHoldingSnapshot" ADD COLUMN IF NOT EXISTS "priorAccession" TEXT;
ALTER TABLE "InstitutionalHoldingSnapshot" ADD COLUMN IF NOT EXISTS "sharesChange" DOUBLE PRECISION;
ALTER TABLE "InstitutionalHoldingSnapshot" ADD COLUMN IF NOT EXISTS "valueChange" DOUBLE PRECISION;
ALTER TABLE "InstitutionalHoldingSnapshot" ADD COLUMN IF NOT EXISTS "metricsJson" JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS "InstitutionalHoldingSnapshot_symbol_filerCik_reportDate_idx"
  ON "InstitutionalHoldingSnapshot"("symbol", "filerCik", "reportDate");

CREATE INDEX IF NOT EXISTS "InstitutionalHoldingSnapshot_filerCik_changeKind_reportDate_idx"
  ON "InstitutionalHoldingSnapshot"("filerCik", "changeKind", "reportDate");

-- Institutional13fFiling bookkeeping
CREATE TABLE IF NOT EXISTS "Institutional13fFiling" (
    "id" TEXT NOT NULL,
    "filerCik" TEXT NOT NULL,
    "filerName" TEXT NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "filedAt" TIMESTAMP(3),
    "accessionNumber" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "holdingCount" INTEGER NOT NULL DEFAULT 0,
    "resolvedCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'processed',
    "errorNote" TEXT,
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Institutional13fFiling_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Institutional13fFiling_accessionNumber_key"
  ON "Institutional13fFiling"("accessionNumber");

CREATE UNIQUE INDEX IF NOT EXISTS "Institutional13fFiling_fingerprint_key"
  ON "Institutional13fFiling"("fingerprint");

CREATE INDEX IF NOT EXISTS "Institutional13fFiling_filerCik_reportDate_idx"
  ON "Institutional13fFiling"("filerCik", "reportDate");

CREATE INDEX IF NOT EXISTS "Institutional13fFiling_status_createdAt_idx"
  ON "Institutional13fFiling"("status", "createdAt");
