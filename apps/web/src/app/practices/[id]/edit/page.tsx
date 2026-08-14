import { notFound, redirect } from "next/navigation"
import { isStaffUi } from "@/lib/athlete-view-server"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/session"
import { isCuid, practiceEditPath } from "@/lib/slug"
import { listManagedPracticeTagNames } from "@/lib/practice-tag-catalog"
import { practiceSetSelect } from "@/lib/practice-input"
import type { PracticeFormState } from "../../PracticeEditor"
import PracticeEditClient from "./PracticeEditClient"

function toDateInput(date: Date | null | undefined): string {
  if (!date) return ""
  return new Date(date).toISOString().slice(0, 10)
}

export default async function PracticeEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: param } = await params
  const session = await getSession()
  if (!session) redirect("/signin?callbackUrl=/practices")

  const isCoach = await isStaffUi(session.user.role)
  if (!isCoach) notFound()

  const practice = await prisma.practice.findFirst({
    where: isCuid(param) ? { OR: [{ id: param }, { slug: param }] } : { slug: param },
    include: {
      sets: { orderBy: { order: "asc" }, select: practiceSetSelect },
    },
  })
  if (!practice) notFound()

  const practiceSlug = practice.slug ?? practice.id
  if (param !== practiceSlug) redirect(practiceEditPath(practiceSlug))

  const initial: PracticeFormState = {
    title: practice.title,
    date: toDateInput(practice.date),
    startTime: practice.startTime,
    endTime: practice.endTime,
    location: practice.location,
    focus: practice.focus ?? "",
    tags: practice.tags,
    published: practice.published,
    sets: practice.sets.map((set) => ({
      id: set.id,
      title: set.title ?? "",
      content: set.content,
      distance: set.distance != null ? String(set.distance) : "",
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
    />
  )
}
