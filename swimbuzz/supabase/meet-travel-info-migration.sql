-- Travel info links on meets
ALTER TABLE "Meet" ADD COLUMN IF NOT EXISTS "rideSignUpsUrl" TEXT;
ALTER TABLE "Meet" ADD COLUMN IF NOT EXISTS "roomsUrl" TEXT;

-- Plain-text travel fields (renamed from *Url columns if present)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Meet' AND column_name = 'hotelUrl'
  ) THEN
    ALTER TABLE "Meet" RENAME COLUMN "hotelUrl" TO "hotel";
  ELSE
    ALTER TABLE "Meet" ADD COLUMN IF NOT EXISTS "hotel" TEXT;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Meet' AND column_name = 'packingListUrl'
  ) THEN
    ALTER TABLE "Meet" RENAME COLUMN "packingListUrl" TO "packingList";
  ELSE
    ALTER TABLE "Meet" ADD COLUMN IF NOT EXISTS "packingList" TEXT;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Meet' AND column_name = 'itineraryUrl'
  ) THEN
    ALTER TABLE "Meet" RENAME COLUMN "itineraryUrl" TO "itinerary";
  ELSE
    ALTER TABLE "Meet" ADD COLUMN IF NOT EXISTS "itinerary" TEXT;
  END IF;
END $$;
