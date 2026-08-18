-- Practice attendance (Buzzcard check-ins)
-- Prefer: pnpm --filter @swimbuzz/web exec prisma db push
-- This SQL is a reference if you apply manually. Safe to run multiple times.

DO $$ BEGIN
  CREATE TYPE "AttendanceMethod" AS ENUM ('SCAN', 'MANUAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "PracticeAttendance" (
  "id" TEXT NOT NULL,
  "practiceId" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "method" "AttendanceMethod" NOT NULL DEFAULT 'SCAN',
  "recordedById" TEXT,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PracticeAttendance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PracticeAttendance_practiceId_athleteId_key"
  ON "PracticeAttendance"("practiceId", "athleteId");
CREATE INDEX IF NOT EXISTS "PracticeAttendance_practiceId_idx"
  ON "PracticeAttendance"("practiceId");
CREATE INDEX IF NOT EXISTS "PracticeAttendance_athleteId_idx"
  ON "PracticeAttendance"("athleteId");

DO $$ BEGIN
  ALTER TABLE "PracticeAttendance"
    ADD CONSTRAINT "PracticeAttendance_practiceId_fkey"
    FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PracticeAttendance"
    ADD CONSTRAINT "PracticeAttendance_athleteId_fkey"
    FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PracticeAttendance"
    ADD CONSTRAINT "PracticeAttendance_recordedById_fkey"
    FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Buzzcard scans resolve athletes by GTID.
CREATE INDEX IF NOT EXISTS "Athlete_gtid_idx" ON "Athlete"("gtid");
