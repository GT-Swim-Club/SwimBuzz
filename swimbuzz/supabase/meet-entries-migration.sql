-- Meet entry report columns (Hy-Tek team entries PDF fallback)
ALTER TABLE "Meet" ADD COLUMN IF NOT EXISTS "entriesSheetUrl" TEXT;
ALTER TABLE "Meet" ADD COLUMN IF NOT EXISTS "entriesSheetSummary" JSONB;
