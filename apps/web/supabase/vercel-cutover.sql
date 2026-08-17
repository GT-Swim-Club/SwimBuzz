-- Vercel cutover: signup monitor idempotency + scraper job apply fields
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS "MeetSignupMonitorEvent" (
  "id" TEXT NOT NULL,
  "meetId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "advanceMinutes" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MeetSignupMonitorEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MeetSignupMonitorEvent_meetId_kind_advanceMinutes_key"
  ON "MeetSignupMonitorEvent"("meetId", "kind", "advanceMinutes");

CREATE INDEX IF NOT EXISTS "MeetSignupMonitorEvent_meetId_idx"
  ON "MeetSignupMonitorEvent"("meetId");

DO $$ BEGIN
  ALTER TABLE "MeetSignupMonitorEvent"
    ADD CONSTRAINT "MeetSignupMonitorEvent_meetId_fkey"
    FOREIGN KEY ("meetId") REFERENCES "Meet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "ScraperJob" ADD COLUMN IF NOT EXISTS "applyContext" JSONB;
ALTER TABLE "ScraperJob" ADD COLUMN IF NOT EXISTS "appliedAt" TIMESTAMP(3);
ALTER TABLE "ScraperJob" ADD COLUMN IF NOT EXISTS "applyResult" JSONB;

CREATE INDEX IF NOT EXISTS "ScraperJob_completedAt_idx" ON "ScraperJob"("completedAt");
