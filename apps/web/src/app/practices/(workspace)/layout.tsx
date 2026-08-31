import { Suspense, type ReactNode } from "react"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { htmlToPlainText, zonedDayKey } from "@swimbuzz/shared"
import { isStaffUi } from "@/lib/athlete-view-server"
import { listManagedPracticeTags } from "@/lib/practice-tag-catalog"
import { getSession } from "@/lib/session"
import PracticesSidebar from "../PracticesSidebar"
import PracticesWorkspaceSkeleton from "../PracticesWorkspaceSkeleton"
import type { PracticeRailItem } from "../workspace-params"

/**
 * Shared ancestor for /practices and /practices/[id] (a route group so
 * /practices/[id]/edit and /practices/[id]/attendance, which render full-page
 * without the sidebar, opt out of it). Fetches sidebar data once; because this
 * layout instance persists across navigation between those two routes, clicking
 * a practice no longer remounts (and re-skeletons) the sidebar.
 */
export default async function PracticesWorkspaceLayout({ children }: { children: ReactNode }) {
  const session = await getSession()
  if (!session) redirect("/signin?callbackUrl=/practices")

  const [isCoach, managedTags] = await Promise.all([
    isStaffUi(session.user.role),
    listManagedPracticeTags(),
  ])

  const rows = await prisma.practice.findMany({
    where: isCoach ? undefined : { published: true },
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      published: true,
      tags: true,
      startsAt: true,
      createdAt: true,
      timeZone: true,
      location: true,
      focus: true,
      sets: { select: { title: true, content: true, distance: true } },
    },
  })

  const practices: PracticeRailItem[] = rows.map((p) => {
    const startsAt = p.startsAt ?? p.createdAt
    const searchText = [
      p.title,
      p.focus ?? "",
      ...p.sets.flatMap((s) => [s.title ?? "", htmlToPlainText(s.content)]),
    ]
      .join(" ")
      .toLowerCase()
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      published: p.published,
      tags: p.tags as string[],
      totalDistance: p.sets.reduce((sum, s) => sum + (s.distance ?? 0), 0),
      dayKey: zonedDayKey(startsAt, p.timeZone),
      startsAt: startsAt.toISOString(),
      timeZone: p.timeZone,
      location: p.location,
      searchText,
    }
  })

  return (
    <Suspense fallback={<PracticesWorkspaceSkeleton />}>
      <PracticesSidebar isCoach={isCoach} managedTags={managedTags} practices={practices}>
        {children}
      </PracticesSidebar>
    </Suspense>
  )
}
