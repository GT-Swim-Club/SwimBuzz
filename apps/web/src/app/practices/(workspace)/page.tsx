import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { isStaffUi } from "@/lib/athlete/athlete-view-server"
import { getSession } from "@/lib/auth/session"
import { practicePath } from "@/lib/slug"

// Bare /practices has no practice of its own to show, so it redirects to the
// most recently started practice. If there truly are none, render the empty
// state here directly — PracticesSidebar always mounts `children`, so this is
// the only place a redirect (or fallback UI) for the bare route can live.
export default async function PracticesIndexPage() {
  const session = await getSession()
  if (!session) redirect("/signin?callbackUrl=/practices")

  const isCoach = await isStaffUi(session.user.role)

  const mostRecent = await prisma.practice.findFirst({
    where: isCoach ? undefined : { published: true },
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
    select: { slug: true, id: true },
  })

  if (mostRecent) redirect(practicePath(mostRecent.slug ?? mostRecent.id))

  const message = isCoach ? "No practices yet. Create one to get started." : "No practices posted yet."
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-1 items-center justify-center rounded-2xl border border-border-secondary bg-background px-4 py-14 text-center text-sm text-foreground-secondary">
        {message}
      </div>
    </div>
  )
}
