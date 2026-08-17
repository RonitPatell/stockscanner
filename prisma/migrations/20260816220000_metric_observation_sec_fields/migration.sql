-- AlterTable: MetricObservation — period / SEC provenance for financial layer
ALTER TABLE "MetricObservation" ADD COLUMN IF NOT EXISTS "periodStart" TIMESTAMP(3);
ALTER TABLE "MetricObservation" ADD COLUMN IF NOT EXISTS "fiscalYear" INTEGER;
ALTER TABLE "MetricObservation" ADD COLUMN IF NOT EXISTS "fiscalPeriod" TEXT;
ALTER TABLE "MetricObservation" ADD COLUMN IF NOT EXISTS "filedAt" TIMESTAMP(3);
ALTER TABLE "MetricObservation" ADD COLUMN IF NOT EXISTS "accession" TEXT;
ALTER TABLE "MetricObservation" ADD COLUMN IF NOT EXISTS "secConcept" TEXT;
ALTER TABLE "MetricObservation" ADD COLUMN IF NOT EXISTS "evidenceJson" JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS "MetricObservation_symbol_metricKey_fiscalYear_fiscalPeriod_idx"
  ON "MetricObservation"("symbol", "metricKey", "fiscalYear", "fiscalPeriod");

CREATE INDEX IF NOT EXISTS "MetricObservation_accession_idx"
  ON "MetricObservation"("accession");
