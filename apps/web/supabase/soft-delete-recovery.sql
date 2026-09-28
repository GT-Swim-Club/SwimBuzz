-- Apply before deploying soft-delete code (or use prisma db push).
-- Additive only: existing practices, meets and swims are unchanged.
ALTER TABLE "Practice" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Practice" ADD COLUMN IF NOT EXISTS "purgeAfter" TIMESTAMP(3);
ALTER TABLE "Practice" ADD COLUMN IF NOT EXISTS "purgeStartedAt" TIMESTAMP(3);
ALTER TABLE "Meet" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Meet" ADD COLUMN IF NOT EXISTS "purgeAfter" TIMESTAMP(3);
ALTER TABLE "Meet" ADD COLUMN IF NOT EXISTS "purgeStartedAt" TIMESTAMP(3);
ALTER TABLE "Meet" ADD COLUMN IF NOT EXISTS "deleteSwimsOnPurge" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "Practice_deletedAt_purgeAfter_idx" ON "Practice"("deletedAt", "purgeAfter");
CREATE INDEX IF NOT EXISTS "Meet_deletedAt_purgeAfter_idx" ON "Meet"("deletedAt", "purgeAfter");
