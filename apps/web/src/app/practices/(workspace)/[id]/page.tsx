import { Suspense } from "react"
import { notFound, redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { isStaffUi } from "@/lib/athlete/athlete-view-server"
import PracticeDetail from "../../[id]/PracticeDetail"
import PracticeViewSkeleton from "../../[id]/PracticeViewSkeleton"
import type { PracticeFormState } from "../../PracticeEditor"
import { serializePracticeEditLock } from "@/lib/practice/practice-edit-lock"
import { isCuid, practicePath } from "@/lib/slug"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@/lib/auth/auth-roles"
import { practiceSetSelect } from "@/lib/practice/practice-input"
import { attendedUserIds } from "@/lib/practice/practice-attendance"
import { toDateInput, toTimeInput } from "@/lib/date-input"
import { withDeleted } from "../../../../../soft-delete-policy"

function canRestoreDeleted(purgeAfter: Date, purgeStartedAt: Date | null): boolean {
  return !purgeStartedAt && purgeAfter.getTime() > Date.now()
}

export default async function PracticePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: param } = await params
  const session = await getSession()
  if (!session) redirect("/signin?callbackUrl=/practices")

  return (
    <Suspense fallback={<PracticeViewSkeleton />}>
      <PracticeDetailLoader param={param} />
    </Suspense>
  )
}

// Kept separate from the page itself (and wrapped in Suspense above) so the
// slow per-practice DB fetch only skeletons the detail pane, not the sidebar
// that PracticesWorkspaceLayout already rendered.
async function PracticeDetailLoader({ param }: { param: string }) {
  const session = await getSession()
  if (!session) redirect("/signin?callbackUrl=/practices")

  const isCoach = await isStaffUi(session.user.role)
  const isStaffUser = isStaffRole(session.user.role)

  const whereParam = isCuid(param) ? { OR: [{ id: param }, { slug: param }] } : { slug: param }
  // A fresh object per call — the soft-delete middleware mutates `include`/`select` in place
  // to inject relation filters, so a single shared object would leak the live query's
  // filters into the withDeleted() fallback below and silently hide its nested rows.
  function buildInclude() {
    return {
      sets: { orderBy: { order: "asc" as const }, select: practiceSetSelect },
      comments: {
        orderBy: { createdAt: "asc" as const },
        include: { author: { select: { image: true, staffTitle: true } } },
      },
      editLockedBy: { select: { id: true, name: true } },
    }
  }

  let practice = await prisma.practice.findFirst({ where: whereParam, include: buildInclude() })

  // Not found in the live scope — if the viewer can manage Trash, check whether
  // it's sitting there instead of just 404ing. Comments/attendance stay hidden
  // (cascade-hidden alongside the practice) since neither matters for a trashed item.
  // Keyed on the real role (not Athlete View) so the redirect below can tell a
  // trashed practice apart from one that never existed.
  let deletedInfo: { purgeAfter: string; canRestore: boolean } | null = null
  if (!practice && isStaffUser) {
    const deleted = await withDeleted(() =>
      prisma.practice.findFirst({
        where: { ...whereParam, deletedAt: { not: null } },
        include: buildInclude(),
      })
    )
    if (deleted) {
      practice = deleted
      deletedInfo = {
        purgeAfter: deleted.purgeAfter!.toISOString(),
        canRestore: canRestoreDeleted(deleted.purgeAfter!, deleted.purgeStartedAt),
      }
    }
  }

  if (!practice) notFound()
  if (!isCoach && (!practice.published || deletedInfo)) {
    // Staff who just switched into Athlete View while on a draft/trashed
    // practice: it exists, it's just hidden in this view — land them on the
    // practice list rather than a 404. Real athletes still get the 404.
    if (isStaffUser) redirect("/practices")
    notFound()
  }
  if (practice.slug && param !== practice.slug) redirect(practicePath(practice.slug))

  const totalDistance = practice.sets.reduce((sum, s) => sum + (s.distance ?? 0), 0)
  const attendedUsers = deletedInfo ? [] : await attendedUserIds(practice.id)
  const initialEditLock = serializePracticeEditLock(practice, session.user.id)
  const startsAt = practice.startsAt ?? practice.createdAt
  const endsAt = practice.endsAt ?? startsAt

  const initial: PracticeFormState = {
    title: practice.title,
    date: toDateInput(startsAt, practice.timeZone),
    startTime: toTimeInput(startsAt, practice.timeZone),
    endTime: toTimeInput(endsAt, practice.timeZone),
    timeZone: practice.timeZone,
    location: practice.location,
    course: practice.course,
    focus: practice.focus ?? "",
    tags: practice.tags,
    published: practice.published,
    sets: practice.sets.map((s) => ({
      id: s.id,
      title: s.title ?? "",
      content: s.content,
      distance: s.distance != null ? String(s.distance) : "",
      startsNewRow: s.startsNewRow,
    })),
  }

  return (
    <PracticeDetail
      practiceId={practice.id}
      practiceSlug={practice.slug}
      title={practice.title}
      published={practice.published}
      startsAt={startsAt.toISOString()}
      endsAt={endsAt.toISOString()}
      timeZone={practice.timeZone}
      location={practice.location}
      course={practice.course}
      focus={practice.focus}
      tags={practice.tags}
      sets={practice.sets.map((s) => ({
        id: s.id,
        title: s.title,
        content: s.content,
        distance: s.distance,
        startsNewRow: s.startsNewRow,
      }))}
      totalDistance={totalDistance}
      initial={initial}
      isCoach={isCoach}
      currentUserId={session.user.id}
      attendedUserIds={attendedUsers}
      comments={practice.comments.map((c) => ({
        id: c.id,
        authorName: c.authorName,
        authorId: c.authorId,
        authorImage: c.author?.image ?? null,
        authorStaffTitle: c.author?.staffTitle ?? null,
        body: c.body,
        parentId: c.parentId,
        createdAt: c.createdAt.toISOString(),
        editedAt: c.editedAt ? c.editedAt.toISOString() : null,
      }))}
      initialEditLock={initialEditLock}
      deletedInfo={deletedInfo}
    />
  )
}
