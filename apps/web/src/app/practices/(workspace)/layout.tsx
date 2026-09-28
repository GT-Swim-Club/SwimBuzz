import { Suspense, type ReactNode } from "react"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { htmlToPlainText, zonedDayKey } from "@swimbuzz/shared"
import { isStaffUi } from "@/lib/athlete/athlete-view-server"
import { listManagedPracticeTags } from "@/lib/practice/practice-tag-catalog"
import { getSession } from "@/lib/auth/session"
import { withDeleted } from "../../../../soft-delete-policy"
import PracticesSidebar from "../PracticesSidebar"
import PracticesWorkspaceSkeleton from "../PracticesWorkspaceSkeleton"
import type { DeletedPracticeRailItem, PracticeRailItem } from "../workspace-params"

type PracticeRow = {
  id: string
  slug: string | null
  title: string
  published: boolean
  tags: unknown
  startsAt: Date | null
  endsAt: Date | null
  createdAt: Date
  timeZone: string
  location: string
  course: string
  focus: string | null
  sets: { title: string | null; content: string; distance: number | null }[]
}

type DeletedPracticeRow = PracticeRow & {
  deletedAt: Date | null
  purgeAfter: Date | null
  purgeStartedAt: Date | null
}

function canRestoreDeleted(purgeAfter: Date, purgeStartedAt: Date | null): boolean {
  return !purgeStartedAt && purgeAfter.getTime() > Date.now()
}

function toDeletedPracticeRailItem(p: DeletedPracticeRow): DeletedPracticeRailItem {
  return {
    ...toPracticeRailItem(p),
    deletedAt: p.deletedAt!.toISOString(),
    purgeAfter: p.purgeAfter!.toISOString(),
    canRestore: canRestoreDeleted(p.purgeAfter!, p.purgeStartedAt),
  }
}

function toPracticeRailItem(p: PracticeRow): PracticeRailItem {
  const startsAt = p.startsAt ?? p.createdAt
  const endsAt = p.endsAt ?? startsAt
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
    endsAt: endsAt.toISOString(),
    timeZone: p.timeZone,
    location: p.location,
    course: p.course,
    searchText,
  }
}

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

  const selectFields = {
    id: true,
    slug: true,
    title: true,
    published: true,
    tags: true,
    startsAt: true,
    endsAt: true,
    createdAt: true,
    timeZone: true,
    location: true,
    course: true,
    focus: true,
    sets: { select: { title: true, content: true, distance: true } },
  } as const

  const [rows, deletedRows] = await Promise.all([
    prisma.practice.findMany({
      where: isCoach ? undefined : { published: true },
      orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
      select: selectFields,
    }),
    isCoach
      ? withDeleted(() =>
          prisma.practice.findMany({
            where: { deletedAt: { not: null } },
            orderBy: { deletedAt: "desc" },
            select: { ...selectFields, deletedAt: true, purgeAfter: true, purgeStartedAt: true },
          })
        )
      : Promise.resolve([]),
  ])

  const practices: PracticeRailItem[] = rows.map(toPracticeRailItem)

  const deletedPractices: DeletedPracticeRailItem[] = deletedRows.map(toDeletedPracticeRailItem)

  return (
    <Suspense fallback={<PracticesWorkspaceSkeleton />}>
      <PracticesSidebar
        isCoach={isCoach}
        managedTags={managedTags}
        practices={practices}
        deletedPractices={deletedPractices}
      >
        {children}
      </PracticesSidebar>
    </Suspense>
  )
}
