-- Team code used when parsing psych/heat/entry sheets
ALTER TABLE "Meet" ADD COLUMN IF NOT EXISTS "teamCode" TEXT NOT NULL DEFAULT 'GTSC';
