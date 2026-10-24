import { notFound, redirect } from "next/navigation"
import { isStaffUi } from "@/lib/athlete/athlete-view-server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth/session"
import { isCuid, practiceEditPath, practicePath } from "@/lib/slug"
import { listManagedPracticeTagNames } from "@/lib/practice/practice-tag-catalog"
import { practiceSetSelect } from "@/lib/practice/practice-input"
import { canEditPractice, canViewPractice } from "@/lib/practice/practice-access"
import type { PracticeFormState } from "../../PracticeEditor"
import PracticeEditClient from "./PracticeEditClient"
import { toDateInput, toTimeInput } from "@/lib/date-input"

export default async function PracticeEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: param } = await params
  const session = await getSession()
  if (!session) redirect("/signin?callbackUrl=/practices")

  const isCoach = await isStaffUi(session.user.role)

  const practice = await prisma.practice.findFirst({
    where: isCuid(param) ? { OR: [{ id: param }, { slug: param }] } : { slug: param },
    include: {
      sets: { orderBy: { order: "asc" }, select: practiceSetSelect },
    },
  })
  const viewer = { userId: session.user.id, isStaff: isCoach }
  if (!practice || !canViewPractice(practice, viewer)) {
    if (!isCoach) redirect(practicePath(param))
    notFound()
  }
  if (!canEditPractice(practice, viewer)) redirect(practicePath(param))

  const practiceSlug = practice.slug ?? practice.id
  if (param !== practiceSlug) redirect(practiceEditPath(practiceSlug))

  const initial: PracticeFormState = {
    title: practice.title,
    date: toDateInput(practice.startsAt, practice.timeZone),
    startTime: toTimeInput(practice.startsAt, practice.timeZone),
    endTime: toTimeInput(practice.endsAt, practice.timeZone),
    timeZone: practice.timeZone,
    location: practice.location,
    course: practice.course,
    focus: practice.focus ?? "",
    tags: practice.tags,
    published: practice.published,
    visibility: practice.visibility,
    sets: practice.sets.map((set) => ({
      id: set.id,
      title: set.title ?? "",
      content: set.content,
      distance: set.distance != null ? String(set.distance) : "",
      startsNewRow: set.startsNewRow,
    })),
  }

  const availableTags = await listManagedPracticeTagNames()

  return (
    <PracticeEditClient
      practiceId={practice.id}
      practiceSlug={practiceSlug}
      title={practice.title}
      initial={initial}
      availableTags={availableTags}
      canChooseVisibility={isCoach}
    />
  )
}
