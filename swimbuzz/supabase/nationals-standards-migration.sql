-- Nationals qualifying standards + NQT PDF parse job type.
ALTER TYPE "BridgeJobType" ADD VALUE IF NOT EXISTS 'PARSE_NQT_PDF';

CREATE TABLE IF NOT EXISTS "NationalsStandardSet" (
  "id" TEXT NOT NULL,
  "season" TEXT NOT NULL,
  "course" "Course" NOT NULL DEFAULT 'SCY',
  "label" TEXT NOT NULL DEFAULT 'Nationals',
  "sourceUrl" TEXT,
  "yearLabel" TEXT,
  "table" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NationalsStandardSet_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "NationalsStandardSet" ADD COLUMN IF NOT EXISTS "table" JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS "NationalsStandardSet_season_course_key"
  ON "NationalsStandardSet"("season", "course");
CREATE INDEX IF NOT EXISTS "NationalsStandardSet_season_idx"
  ON "NationalsStandardSet"("season");

CREATE TABLE IF NOT EXISTS "NationalsCut" (
  "id" TEXT NOT NULL,
  "setId" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "gender" "Gender" NOT NULL,
  "timeMs" INTEGER NOT NULL,
  "note" TEXT,
  "isRelay" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "NationalsCut_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NationalsCut_setId_event_gender_key"
  ON "NationalsCut"("setId", "event", "gender");
CREATE INDEX IF NOT EXISTS "NationalsCut_setId_idx"
  ON "NationalsCut"("setId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'NationalsCut_setId_fkey'
  ) THEN
    ALTER TABLE "NationalsCut"
      ADD CONSTRAINT "NationalsCut_setId_fkey"
      FOREIGN KEY ("setId") REFERENCES "NationalsStandardSet"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
