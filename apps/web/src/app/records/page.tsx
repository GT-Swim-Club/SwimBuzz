import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth/session"
import { listTeamRecords } from "@/lib/records/records"
import RecordsView from "./RecordsView"
import RecordsSkeleton from "./RecordsSkeleton"

export const dynamic = "force-dynamic"

async function RecordsContent() {
  return <RecordsView initial={await listTeamRecords()} />
}

export const metadata = { title: "Records" }

export default async function RecordsPage() {
  const session = await getSession()
  if (!session) redirect("/signin")

  return (
    <main className="flex flex-col gap-4">
      <h1 className="sr-only">Team Records</h1>
      <Suspense fallback={<RecordsSkeleton />}>
        <RecordsContent />
      </Suspense>
    </main>
  )
}
