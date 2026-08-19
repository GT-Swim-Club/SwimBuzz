/**
 * Demote orphaned coach/exec users left over from the old, unrestricted
 * Google sign-in (any Google account signing in became a COACH — see
 * User.role's old @default(COACH), and the mobile Google route that used to
 * hard-code role: Role.COACH). Anyone with a staff role but no linked roster
 * Athlete never went through the new two-step staff sign-in and shouldn't
 * keep staff access.
 *
 * Real staff are unaffected — they have a linked Athlete (the GT-email OTP
 * step requires it) — and simply re-onboard through the new Coaches & Exec
 * sign-in flow, which binds them to their roster Athlete and stamps their
 * title.
 *
 * Run after `prisma db push` applies the staffTitle/staffTerm columns:
 *   node scripts/backfill-staff-roles.mjs
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const orphanedStaff = await prisma.user.findMany({
    where: {
      role: { in: ["COACH", "EXEC"] },
      athlete: null,
    },
    select: { id: true, email: true, name: true, role: true, staffTitle: true },
  })

  if (orphanedStaff.length === 0) {
    console.log("No orphaned coach/exec accounts found — nothing to demote.")
    return
  }

  console.log(`Demoting ${orphanedStaff.length} orphaned staff account(s):`)
  for (const user of orphanedStaff) {
    console.log(
      `  - ${user.email} (${user.name ?? "no name"}) — was ${user.role}${
        user.staffTitle ? `/${user.staffTitle}` : ""
      }`
    )
  }

  const { count } = await prisma.user.updateMany({
    where: { id: { in: orphanedStaff.map((u) => u.id) } },
    data: { role: "ATHLETE", staffTitle: null, staffTerm: null },
  })

  console.log(`Demoted ${count} account(s) to ATHLETE.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
