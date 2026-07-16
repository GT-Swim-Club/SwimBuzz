-- Extra notification types + per-user preference toggles
DO $$ BEGIN
  ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PRACTICE_PUBLISHED';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MEET_SIGNUP_OPEN';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PRACTICE_COMMENT';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "notificationPreferences" JSONB;
