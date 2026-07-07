-- Run once before `npx prisma db push` if Meet.season / Athlete.seasons still store integers.
-- Use: npx prisma db execute --file supabase/season-format-migration.sql

CREATE OR REPLACE FUNCTION migrate_seasons(arr int[]) RETURNS text[] AS $$
  SELECT COALESCE(
    array_agg((elem - 1)::text || '-' || elem::text ORDER BY elem),
    ARRAY[]::text[]
  )
  FROM unnest(arr) AS elem;
$$ LANGUAGE sql IMMUTABLE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Meet'
      AND column_name = 'season' AND data_type = 'integer'
  ) THEN
    ALTER TABLE "Meet"
      ALTER COLUMN "season" TYPE text
      USING ((season - 1)::text || '-' || season::text);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Athlete'
      AND column_name = 'seasons' AND udt_name = '_int4'
  ) THEN
    ALTER TABLE "Athlete"
      ALTER COLUMN "seasons" TYPE text[]
      USING migrate_seasons(seasons);
  END IF;
END $$;

DROP FUNCTION IF EXISTS migrate_seasons(int[]);
