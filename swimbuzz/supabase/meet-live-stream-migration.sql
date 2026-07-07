-- Live stream link on meet resources
ALTER TABLE "Meet" ADD COLUMN IF NOT EXISTS "liveStreamUrl" TEXT;
