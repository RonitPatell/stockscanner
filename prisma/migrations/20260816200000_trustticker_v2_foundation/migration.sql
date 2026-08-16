-- CreateTable
CREATE TABLE "PortfolioItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "cik" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'watch',
    "shares" DOUBLE PRECISION,
    "costBasisPerShare" DOUBLE PRECISION,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'api',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyEvent" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "cik" TEXT,
    "category" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'unknown',
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceUrl" TEXT,
    "evidenceJson" JSONB NOT NULL DEFAULT '{}',
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "fingerprint" TEXT NOT NULL,
    "catalystId" TEXT,
    "dilutionInstrumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricObservation" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "cik" TEXT,
    "periodEnd" TIMESTAMP(3),
    "periodLabel" TEXT,
    "metricKey" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "unit" TEXT,
    "currency" TEXT,
    "priorValue" DOUBLE PRECISION,
    "priorPeriodLabel" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceUrl" TEXT,
    "confidence" TEXT NOT NULL DEFAULT 'unknown',
    "fingerprint" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestmentThesis" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "premise" TEXT,
    "healthStatus" TEXT NOT NULL DEFAULT 'unknown',
    "lastEvaluatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestmentThesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThesisCondition" (
    "id" TEXT NOT NULL,
    "thesisId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "conditionType" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "paramsJson" JSONB NOT NULL DEFAULT '{}',
    "polarity" TEXT NOT NULL DEFAULT 'support_if',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThesisCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThesisEvaluation" (
    "id" TEXT NOT NULL,
    "thesisId" TEXT NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "healthStatus" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "summary" TEXT,
    "resultsJson" JSONB NOT NULL DEFAULT '{}',
    "companyEventIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThesisEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapitalRiskSnapshot" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "cik" TEXT,
    "asOf" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "summary" TEXT,
    "metricsJson" JSONB NOT NULL DEFAULT '{}',
    "instrumentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CapitalRiskSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FilingSectionSnapshot" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "cik" TEXT,
    "accessionNumber" TEXT NOT NULL,
    "formType" TEXT NOT NULL,
    "sectionKey" TEXT NOT NULL,
    "filingDate" TIMESTAMP(3),
    "textHash" TEXT NOT NULL,
    "textExcerpt" TEXT,
    "priorAccession" TEXT,
    "priorTextHash" TEXT,
    "diffJson" JSONB,
    "sourceUrl" TEXT,
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FilingSectionSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsiderTransaction" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "cik" TEXT,
    "accessionNumber" TEXT NOT NULL,
    "filedAt" TIMESTAMP(3) NOT NULL,
    "transactionDate" TIMESTAMP(3),
    "ownerName" TEXT NOT NULL,
    "ownerCik" TEXT,
    "isDirector" BOOLEAN,
    "isOfficer" BOOLEAN,
    "isTenPercent" BOOLEAN,
    "officerTitle" TEXT,
    "transactionCode" TEXT,
    "shares" DOUBLE PRECISION,
    "pricePerShare" DOUBLE PRECISION,
    "sharesOwnedAfter" DOUBLE PRECISION,
    "isDirect" BOOLEAN,
    "securityTitle" TEXT,
    "footnotesJson" JSONB,
    "sourceUrl" TEXT,
    "fingerprint" TEXT NOT NULL,
    "companyEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsiderTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstitutionalHoldingSnapshot" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "cusip" TEXT,
    "filerCik" TEXT NOT NULL,
    "filerName" TEXT NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "filedAt" TIMESTAMP(3),
    "shares" DOUBLE PRECISION,
    "valueUsd" DOUBLE PRECISION,
    "putCall" TEXT,
    "investmentDiscretion" TEXT,
    "accessionNumber" TEXT,
    "sourceUrl" TEXT,
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstitutionalHoldingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCompanyEventState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyEventId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCompanyEventState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "payloadJson" JSONB,
    "errorMessage" TEXT,
    "companyEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PortfolioItem_userId_archivedAt_idx" ON "PortfolioItem"("userId", "archivedAt");

-- CreateIndex
CREATE INDEX "PortfolioItem_userId_sortOrder_idx" ON "PortfolioItem"("userId", "sortOrder");

-- CreateIndex
CREATE INDEX "PortfolioItem_symbol_idx" ON "PortfolioItem"("symbol");

-- CreateIndex
CREATE INDEX "PortfolioItem_symbol_archivedAt_idx" ON "PortfolioItem"("symbol", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioItem_userId_symbol_key" ON "PortfolioItem"("userId", "symbol");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyEvent_fingerprint_key" ON "CompanyEvent"("fingerprint");

-- CreateIndex
CREATE INDEX "CompanyEvent_symbol_occurredAt_idx" ON "CompanyEvent"("symbol", "occurredAt");

-- CreateIndex
CREATE INDEX "CompanyEvent_symbol_category_occurredAt_idx" ON "CompanyEvent"("symbol", "category", "occurredAt");

-- CreateIndex
CREATE INDEX "CompanyEvent_category_eventType_occurredAt_idx" ON "CompanyEvent"("category", "eventType", "occurredAt");

-- CreateIndex
CREATE INDEX "CompanyEvent_detectedAt_idx" ON "CompanyEvent"("detectedAt");

-- CreateIndex
CREATE INDEX "CompanyEvent_sourceType_sourceId_idx" ON "CompanyEvent"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "CompanyEvent_catalystId_idx" ON "CompanyEvent"("catalystId");

-- CreateIndex
CREATE UNIQUE INDEX "MetricObservation_fingerprint_key" ON "MetricObservation"("fingerprint");

-- CreateIndex
CREATE INDEX "MetricObservation_symbol_metricKey_periodEnd_idx" ON "MetricObservation"("symbol", "metricKey", "periodEnd");

-- CreateIndex
CREATE INDEX "MetricObservation_symbol_observedAt_idx" ON "MetricObservation"("symbol", "observedAt");

-- CreateIndex
CREATE INDEX "MetricObservation_metricKey_periodEnd_idx" ON "MetricObservation"("metricKey", "periodEnd");

-- CreateIndex
CREATE INDEX "InvestmentThesis_userId_status_idx" ON "InvestmentThesis"("userId", "status");

-- CreateIndex
CREATE INDEX "InvestmentThesis_symbol_status_idx" ON "InvestmentThesis"("symbol", "status");

-- CreateIndex
CREATE INDEX "InvestmentThesis_userId_updatedAt_idx" ON "InvestmentThesis"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InvestmentThesis_userId_symbol_key" ON "InvestmentThesis"("userId", "symbol");

-- CreateIndex
CREATE INDEX "ThesisCondition_thesisId_sortOrder_idx" ON "ThesisCondition"("thesisId", "sortOrder");

-- CreateIndex
CREATE INDEX "ThesisCondition_conditionType_idx" ON "ThesisCondition"("conditionType");

-- CreateIndex
CREATE INDEX "ThesisEvaluation_thesisId_evaluatedAt_idx" ON "ThesisEvaluation"("thesisId", "evaluatedAt");

-- CreateIndex
CREATE INDEX "ThesisEvaluation_evaluatedAt_idx" ON "ThesisEvaluation"("evaluatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CapitalRiskSnapshot_fingerprint_key" ON "CapitalRiskSnapshot"("fingerprint");

-- CreateIndex
CREATE INDEX "CapitalRiskSnapshot_symbol_asOf_idx" ON "CapitalRiskSnapshot"("symbol", "asOf");

-- CreateIndex
CREATE INDEX "CapitalRiskSnapshot_status_asOf_idx" ON "CapitalRiskSnapshot"("status", "asOf");

-- CreateIndex
CREATE UNIQUE INDEX "FilingSectionSnapshot_fingerprint_key" ON "FilingSectionSnapshot"("fingerprint");

-- CreateIndex
CREATE INDEX "FilingSectionSnapshot_symbol_filingDate_idx" ON "FilingSectionSnapshot"("symbol", "filingDate");

-- CreateIndex
CREATE INDEX "FilingSectionSnapshot_symbol_formType_idx" ON "FilingSectionSnapshot"("symbol", "formType");

-- CreateIndex
CREATE INDEX "FilingSectionSnapshot_priorAccession_idx" ON "FilingSectionSnapshot"("priorAccession");

-- CreateIndex
CREATE UNIQUE INDEX "FilingSectionSnapshot_accessionNumber_sectionKey_key" ON "FilingSectionSnapshot"("accessionNumber", "sectionKey");

-- CreateIndex
CREATE UNIQUE INDEX "InsiderTransaction_fingerprint_key" ON "InsiderTransaction"("fingerprint");

-- CreateIndex
CREATE INDEX "InsiderTransaction_symbol_filedAt_idx" ON "InsiderTransaction"("symbol", "filedAt");

-- CreateIndex
CREATE INDEX "InsiderTransaction_symbol_transactionDate_idx" ON "InsiderTransaction"("symbol", "transactionDate");

-- CreateIndex
CREATE INDEX "InsiderTransaction_accessionNumber_idx" ON "InsiderTransaction"("accessionNumber");

-- CreateIndex
CREATE INDEX "InsiderTransaction_companyEventId_idx" ON "InsiderTransaction"("companyEventId");

-- CreateIndex
CREATE UNIQUE INDEX "InstitutionalHoldingSnapshot_fingerprint_key" ON "InstitutionalHoldingSnapshot"("fingerprint");

-- CreateIndex
CREATE INDEX "InstitutionalHoldingSnapshot_symbol_reportDate_idx" ON "InstitutionalHoldingSnapshot"("symbol", "reportDate");

-- CreateIndex
CREATE INDEX "InstitutionalHoldingSnapshot_filerCik_reportDate_idx" ON "InstitutionalHoldingSnapshot"("filerCik", "reportDate");

-- CreateIndex
CREATE INDEX "InstitutionalHoldingSnapshot_accessionNumber_idx" ON "InstitutionalHoldingSnapshot"("accessionNumber");

-- CreateIndex
CREATE INDEX "UserCompanyEventState_userId_readAt_idx" ON "UserCompanyEventState"("userId", "readAt");

-- CreateIndex
CREATE INDEX "UserCompanyEventState_userId_dismissedAt_idx" ON "UserCompanyEventState"("userId", "dismissedAt");

-- CreateIndex
CREATE INDEX "UserCompanyEventState_userId_updatedAt_idx" ON "UserCompanyEventState"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserCompanyEventState_userId_companyEventId_key" ON "UserCompanyEventState"("userId", "companyEventId");

-- CreateIndex
CREATE INDEX "NotificationDelivery_userId_createdAt_idx" ON "NotificationDelivery"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_subjectType_subjectId_idx" ON "NotificationDelivery"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "NotificationDelivery_companyEventId_idx" ON "NotificationDelivery"("companyEventId");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_createdAt_idx" ON "NotificationDelivery"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_userId_channel_dedupeKey_key" ON "NotificationDelivery"("userId", "channel", "dedupeKey");

-- AddForeignKey
ALTER TABLE "PortfolioItem" ADD CONSTRAINT "PortfolioItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentThesis" ADD CONSTRAINT "InvestmentThesis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThesisCondition" ADD CONSTRAINT "ThesisCondition_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "InvestmentThesis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThesisEvaluation" ADD CONSTRAINT "ThesisEvaluation_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "InvestmentThesis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCompanyEventState" ADD CONSTRAINT "UserCompanyEventState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCompanyEventState" ADD CONSTRAINT "UserCompanyEventState_companyEventId_fkey" FOREIGN KEY ("companyEventId") REFERENCES "CompanyEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_companyEventId_fkey" FOREIGN KEY ("companyEventId") REFERENCES "CompanyEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Data backfill: expand User.watchlist[] → PortfolioItem (idempotent).
-- Does not drop or rewrite watchlist. Invalid-run safe via ON CONFLICT DO NOTHING.
-- Invalidymbols that are not 1–5 letters are skipped.
-- ---------------------------------------------------------------------------
INSERT INTO "PortfolioItem" (
  "id",
  "userId",
  "symbol",
  "kind",
  "sortOrder",
  "source",
  "createdAt",
  "updatedAt"
)
SELECT
  'pi_' || replace(gen_random_uuid()::text, '-', ''),
  u.id,
  upper(trim(sym.sym)),
  'watch',
  (sym.ord::integer - 1),
  'watchlist_migration',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" u
CROSS JOIN LATERAL unnest(u."watchlist") WITH ORDINALITY AS sym(sym, ord)
WHERE length(trim(sym.sym)) BETWEEN 1 AND 5
  AND upper(trim(sym.sym)) ~ '^[A-Z]{1,5}$'
ON CONFLICT ("userId", "symbol") DO NOTHING;

