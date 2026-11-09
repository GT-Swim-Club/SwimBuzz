import { Suspense } from "react"
import { redirect } from "next/navigation"
import { athletePreferredName, isStaffRole } from "@swimbuzz/shared"
import { isStaffUi } from "@/lib/athlete/athlete-view-server"
import { getSession } from "@/lib/auth/session"
import { prisma } from "@/lib/prisma"
import { listTeamRecords } from "@/lib/records/records"
import RecordsView from "./RecordsView"
import RecordsSkeleton from "./RecordsSkeleton"

export const dynamic = "force-dynamic"

async function RecordsContent({ role }: { role: string }) {
  const [canEdit, records] = await Promise.all([isStaffUi(role), listTeamRecords()])
  // Name suggestions while staff type a record holder; typed names link to the athlete server-side.
  const athletes = canEdit
    ? await prisma.athlete.findMany({
        select: { firstName: true, lastName: true, preferredName: true },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      })
    : []
  const athleteNames = [...new Set(athletes.map((a) => athletePreferredName(a)))]
  return <RecordsView initial={records} canEdit={canEdit} athleteNames={athleteNames} />
}

export default async function RecordsPage() {
  const session = await getSession()
  if (!session) redirect("/signin")

  return (
    <main className="flex flex-col gap-4">
      <h1 className="sr-only">Team Records</h1>
      <Suspense fallback={<RecordsSkeleton canEdit={isStaffRole(session.user.role)} />}>
        <RecordsContent role={session.user.role} />
      </Suspense>
    </main>
  )
}
