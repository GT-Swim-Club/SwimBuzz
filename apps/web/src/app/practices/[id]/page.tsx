import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import { isStaffUi } from "@/lib/athlete-view-server"
import PracticeDetail from "./PracticeDetail"
import type { PracticeFormState } from "../PracticeEditor"
import { serializePracticeEditLock } from "@/lib/practice-edit-lock"
import { isCuid, practicePath } from "@/lib/slug"
import { getSession } from "@/lib/session"

function toDateInput(d: Date | null | undefined): string {
  if (!d) return ""
  return new Date(d).toISOString().slice(0, 10)
}

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
      sets: { orderBy: { order: "asc" } },
      comments: { orderBy: { createdAt: "asc" } },
      editLockedBy: { select: { id: true, name: true } }}})

  if (!practice || (!practice.published && !isCoach)) notFound()
  if (practice.slug && param !== practice.slug) redirect(practicePath(practice.slug))

  const totalDistance = practice.sets.reduce((sum, s) => sum + (s.distance ?? 0), 0)
  const initialEditLock = serializePracticeEditLock(practice, session.user.id)

  const initial: PracticeFormState = {
    title: practice.title,
    date: toDateInput(practice.date),
    startTime: practice.startTime,
    endTime: practice.endTime,
    location: practice.location,
    focus: practice.focus ?? "",
    tags: practice.tags,
    published: practice.published,
    sets: practice.sets.map((s) => ({
      id: s.id,
      title: s.title ?? "",
      content: s.content,
      notes: s.notes ?? "",
      distance: s.distance != null ? String(s.distance) : ""}))}

  return (
    <PracticeDetail
      practiceId={practice.id}
      title={practice.title}
      published={practice.published}
      dateIso={practice.date ? practice.date.toISOString() : null}
      startTime={practice.startTime}
      endTime={practice.endTime}
      location={practice.location}
      focus={practice.focus}
      tags={practice.tags}
      sets={practice.sets.map((s) => ({
        id: s.id,
        title: s.title,
        content: s.content,
        notes: s.notes,
        distance: s.distance}))}
      totalDistance={totalDistance}
      initial={initial}
      isCoach={isCoach}
      currentUserId={session.user.id}
      comments={practice.comments.map((c) => ({
        id: c.id,
        authorName: c.authorName,
        authorId: c.authorId,
        body: c.body,
        parentId: c.parentId,
        createdAt: c.createdAt.toISOString()}))}
      initialEditLock={initialEditLock}
    />
  )
}
