import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { isStaffUi } from "@/lib/athlete/athlete-view-server"
import { getSession } from "@/lib/auth/session"
import { practicePath } from "@/lib/slug"
import PracticeDetailLoader from "./PracticeDetailLoader"
import ReplaceUrl from "./ReplaceUrl"

// Bare /practices has no practice of its own, so it shows the most recently
// started practice. It renders that practice in place (then swaps the URL to
// its canonical path) rather than redirect()ing: the layout has already
// streamed by then, so a redirect would land client-side, revealing the
// sidebar next to an empty pane and only then loading the detail. If there
// truly are none, render the empty state here directly — PracticesSidebar
// always mounts `children`, so this is the only place it can live.
export default async function PracticesIndexPage() {
  const session = await getSession()
  if (!session) redirect("/signin?callbackUrl=/practices")

  const isCoach = await isStaffUi(session.user.role)

  const mostRecent = await prisma.practice.findFirst({
    where: isCoach ? undefined : { published: true },
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
    select: { slug: true, id: true },
  })

  if (mostRecent) {
    const param = mostRecent.slug ?? mostRecent.id
    return (
      <>
        <ReplaceUrl path={practicePath(param)} />
        <PracticeDetailLoader param={param} />
      </>
    )
  }

  const message = isCoach ? "No practices yet. Create one to get started." : "No practices posted yet."
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-1 items-center justify-center rounded-2xl border border-border-secondary bg-background px-4 py-14 text-center text-sm text-foreground-secondary">
        {message}
      </div>
    </div>
  )
}
