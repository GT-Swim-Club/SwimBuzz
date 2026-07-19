-- School/organization name for the meet (e.g., Georgia Tech)
ALTER TABLE "Meet" ADD COLUMN IF NOT EXISTS "school" TEXT;