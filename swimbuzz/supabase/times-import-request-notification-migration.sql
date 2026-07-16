-- Athlete request for coaches to import/reimport SwimCloud times
DO $$ BEGIN
  ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TIMES_IMPORT_REQUEST';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
