import { redirect } from "next/navigation"
import { isStaffUi } from "@/lib/athlete/athlete-view-server"
import PracticeEditor from "../PracticeEditor"
import { getSession } from "@/lib/auth/session"
import { listManagedPracticeTagNames } from "@/lib/practice/practice-tag-catalog"

export default async function NewPracticePage() {
  const session = await getSession()
  if (!session) redirect("/signin?callbackUrl=/practices/new")

  const isCoach = await isStaffUi(session.user.role)
  if (!isCoach) redirect("/practices")
  const availableTags = await listManagedPracticeTagNames()

  return (
    <main className="mx-auto max-w-4xl">
      <PracticeEditor availableTags={availableTags} />
    </main>
  )
}
