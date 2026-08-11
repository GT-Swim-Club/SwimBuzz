import { redirect } from "next/navigation"
import Link from "next/link"
import { isStaffUi } from "@/lib/athlete-view-server"
import PracticeEditor from "../PracticeEditor"
import { getSession } from "@/lib/session"

export default async function NewPracticePage() {
  const session = await getSession()
  if (!session) redirect("/signin?callbackUrl=/practices/new")

  const isCoach = await isStaffUi(session.user.role)
  if (!isCoach) redirect("/practices")

  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href="/practices"
          className="text-xs text-foreground-tertiary dark:text-foreground-tertiary hover:text-foreground-secondary dark:hover:text-foreground-secondary"
        >
          ← All practices
        </Link>
        <h1 className="mt-1 text-xl font-medium sm:text-2xl">New practice</h1>
      </div>
      <PracticeEditor />
    </main>
  )
}
