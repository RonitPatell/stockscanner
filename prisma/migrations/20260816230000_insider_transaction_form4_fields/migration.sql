-- AlterTable: InsiderTransaction — structured Form 4 classification fields
ALTER TABLE "InsiderTransaction" ADD COLUMN IF NOT EXISTS "issuerName" TEXT;
ALTER TABLE "InsiderTransaction" ADD COLUMN IF NOT EXISTS "acquiredDisposed" TEXT;
ALTER TABLE "InsiderTransaction" ADD COLUMN IF NOT EXISTS "transactionValue" DOUBLE PRECISION;
ALTER TABLE "InsiderTransaction" ADD COLUMN IF NOT EXISTS "holdingChange" DOUBLE PRECISION;
ALTER TABLE "InsiderTransaction" ADD COLUMN IF NOT EXISTS "classification" TEXT NOT NULL DEFAULT 'other';
ALTER TABLE "InsiderTransaction" ADD COLUMN IF NOT EXISTS "is10b51" BOOLEAN;
ALTER TABLE "InsiderTransaction" ADD COLUMN IF NOT EXISTS "summaryText" TEXT;
ALTER TABLE "InsiderTransaction" ADD COLUMN IF NOT EXISTS "metricsJson" JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS "InsiderTransaction_symbol_classification_transactionDate_idx"
  ON "InsiderTransaction"("symbol", "classification", "transactionDate");
