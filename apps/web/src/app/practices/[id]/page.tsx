import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import { isStaffUi } from "@/lib/athlete-view-server"
import PracticeDetail from "./PracticeDetail"
import type { PracticeFormState } from "../PracticeEditor"
import { serializePracticeEditLock } from "@/lib/practice-edit-lock"
import { isCuid, practicePath } from "@/lib/slug"
import { getSession } from "@/lib/session"
import { practiceSetSelect } from "@/lib/practice-input"
import { attendedUserIds } from "@/lib/practice-attendance"
import { toDateInput, toTimeInput } from "@/lib/date-input"

export default async function PracticePage({
  params}: {
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
      comments: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { image: true, staffTitle: true } } },
      },
      editLockedBy: { select: { id: true, name: true } }}})

  if (!practice || (!practice.published && !isCoach)) notFound()
  if (practice.slug && param !== practice.slug) redirect(practicePath(practice.slug))

  const totalDistance = practice.sets.reduce((sum, s) => sum + (s.distance ?? 0), 0)
  const attendedUsers = await attendedUserIds(practice.id)
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
    focus: practice.focus ?? "",
    tags: practice.tags,
    published: practice.published,
    sets: practice.sets.map((s) => ({
      id: s.id,
      title: s.title ?? "",
      content: s.content,
      distance: s.distance != null ? String(s.distance) : ""}))}

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
      focus={practice.focus}
      tags={practice.tags}
      sets={practice.sets.map((s) => ({
        id: s.id,
        title: s.title,
        content: s.content,
        distance: s.distance}))}
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
        editedAt: c.editedAt ? c.editedAt.toISOString() : null}))}
      initialEditLock={initialEditLock}
    />
  )
}
