-- Pending athlete self-service profile edits (SwimCloud ID / nicknames) awaiting coach approval
ALTER TABLE "Athlete" ADD COLUMN IF NOT EXISTS "pendingProfileChanges" JSONB;
