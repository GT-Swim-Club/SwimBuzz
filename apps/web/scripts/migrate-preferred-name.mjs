/**
 * Replace Athlete.nicknames (String[], up to two) with a single
 * Athlete.preferredName (String?). The first nickname was already what the
 * app displayed in place of the legal first name, so it becomes the preferred
 * name; any second nickname is dropped. Pending self-service requests stored
 * in pendingProfileChanges are rewritten the same way.
 *
 * Run BEFORE `prisma db push` — db push would otherwise drop the nicknames
 * column without copying it:
 *   node scripts/migrate-preferred-name.mjs
 *   pnpm --filter @swimbuzz/web exec prisma db push
 *
 * Safe to re-run: every step is a no-op once nicknames is gone.
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const [{ exists }] = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'Athlete' AND column_name = 'nicknames'
    ) AS "exists"
  `
  if (!exists) {
    console.log("Athlete.nicknames is already gone — nothing to migrate.")
    return
  }

  const [, copied, pending] = await prisma.$transaction([
    prisma.$executeRaw`ALTER TABLE "Athlete" ADD COLUMN IF NOT EXISTS "preferredName" TEXT`,
    prisma.$executeRaw`
      UPDATE "Athlete"
      SET "preferredName" = NULLIF(btrim("nicknames"[1]), '')
      WHERE "preferredName" IS NULL AND cardinality("nicknames") > 0
    `,
    prisma.$executeRaw`
      UPDATE "Athlete"
      SET "pendingProfileChanges" =
        ("pendingProfileChanges" - 'nicknames')
        || jsonb_build_object(
          'preferredName',
          NULLIF(btrim("pendingProfileChanges"->'nicknames'->>0), '')
        )
      WHERE "pendingProfileChanges"->'nicknames' IS NOT NULL
    `,
    prisma.$executeRaw`ALTER TABLE "Athlete" DROP COLUMN "nicknames"`,
  ])

  console.log(`Copied a preferred name for ${copied} athlete(s).`)
  console.log(`Rewrote ${pending} pending profile change request(s).`)
  console.log("Dropped Athlete.nicknames. Now run `prisma db push`.")
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
