/**
 * Replace Athlete.swimCloudId (Int?) and Athlete.secondSwimCloudId (Int?) with a
 * single Athlete.swimCloudIds (Int[], main profile first). Also removes the
 * retired athlete self-service request feature: drops
 * Athlete.pendingProfileChanges and deletes PROFILE_CHANGE_* notifications so
 * db push can drop those enum values.
 *
 * Run BEFORE `prisma db push` — db push would otherwise drop the old columns
 * without copying them:
 *   pnpm --filter @swimbuzz/web run migrate-swimcloud-ids
 *   pnpm --filter @swimbuzz/web exec prisma db push
 *
 * Safe to re-run: every step is a no-op once the old columns are gone.
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function athleteColumns() {
  const rows = await prisma.$queryRaw`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'Athlete'
  `
  return new Set(rows.map((row) => row.column_name))
}

async function main() {
  const columns = await athleteColumns()
  const hasMain = columns.has("swimCloudId")
  const hasSecond = columns.has("secondSwimCloudId")

  await prisma.$executeRaw`
    ALTER TABLE "Athlete" ADD COLUMN IF NOT EXISTS "swimCloudIds" INTEGER[] NOT NULL DEFAULT '{}'
  `

  if (hasMain) {
    const second = hasSecond ? `"secondSwimCloudId"` : "NULL::INTEGER"
    // Main first; a second equal to the main is dropped. Only fills empty lists.
    const copied = await prisma.$executeRawUnsafe(`
      UPDATE "Athlete"
      SET "swimCloudIds" = array_remove(
        ARRAY["swimCloudId", CASE WHEN ${second} IS DISTINCT FROM "swimCloudId" THEN ${second} END],
        NULL
      )
      WHERE cardinality("swimCloudIds") = 0
        AND ("swimCloudId" IS NOT NULL OR ${second} IS NOT NULL)
    `)
    console.log(`Copied SwimCloud IDs for ${copied} athlete(s).`)
  } else {
    console.log("Athlete.swimCloudId is already gone — nothing to copy.")
  }

  if (hasSecond) await prisma.$executeRaw`ALTER TABLE "Athlete" DROP COLUMN "secondSwimCloudId"`
  if (hasMain) await prisma.$executeRaw`ALTER TABLE "Athlete" DROP COLUMN "swimCloudId"`
  if (columns.has("pendingProfileChanges")) {
    await prisma.$executeRaw`ALTER TABLE "Athlete" DROP COLUMN "pendingProfileChanges"`
  }

  const notifications = await prisma.$executeRaw`
    DELETE FROM "Notification" WHERE "type"::text LIKE 'PROFILE_CHANGE_%'
  `
  console.log(`Deleted ${notifications} profile change notification(s).`)
  console.log("Done. Now run `prisma db push`.")
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
