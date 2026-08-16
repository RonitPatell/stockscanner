-- AlterTable
ALTER TABLE "PortfolioItem" ADD COLUMN     "label" TEXT,
ADD COLUMN     "monitoredSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Preserve monitoring start as original create time when available.
UPDATE "PortfolioItem" SET "monitoredSince" = "createdAt";
