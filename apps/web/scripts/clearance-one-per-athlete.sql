-- One-off: physical & concussion clearance becomes one-and-done (one row per athlete, status only).
-- Run BEFORE `prisma db push` (push would otherwise fail on the new unique athleteId):
--   pnpm --filter @swimbuzz/web exec prisma db execute --file scripts/clearance-one-per-athlete.sql --schema prisma/schema.prisma
-- Merge rule: a check is cleared if it was cleared in any season. The newest row per athlete is kept.

BEGIN;

WITH merged AS (
  SELECT "athleteId",
         bool_or("physicalCleared")   AS physical,
         bool_or("concussionCleared") AS concussion
  FROM "AthleteClearance"
  GROUP BY "athleteId"
),
keep AS (
  SELECT DISTINCT ON ("athleteId") id, "athleteId"
  FROM "AthleteClearance"
  ORDER BY "athleteId", "updatedAt" DESC
)
UPDATE "AthleteClearance" ac
SET "physicalCleared" = m.physical,
    "concussionCleared" = m.concussion
FROM keep k
JOIN merged m ON m."athleteId" = k."athleteId"
WHERE ac.id = k.id;

DELETE FROM "AthleteClearance"
WHERE id NOT IN (
  SELECT DISTINCT ON ("athleteId") id
  FROM "AthleteClearance"
  ORDER BY "athleteId", "updatedAt" DESC
);

DROP INDEX IF EXISTS "AthleteClearance_athleteId_season_key";
DROP INDEX IF EXISTS "AthleteClearance_season_idx";
ALTER TABLE "AthleteClearance"
  DROP COLUMN IF EXISTS "season",
  DROP COLUMN IF EXISTS "physicalDate",
  DROP COLUMN IF EXISTS "concussionDate";
CREATE UNIQUE INDEX IF NOT EXISTS "AthleteClearance_athleteId_key" ON "AthleteClearance"("athleteId");

COMMIT;
