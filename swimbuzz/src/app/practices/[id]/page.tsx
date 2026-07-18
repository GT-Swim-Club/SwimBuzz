import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import { isStaffUi } from "@/lib/athlete-view-server"
import PracticeDetail from "./PracticeDetail"
import type { PracticeFormState } from "../PracticeEditor"
import { serializePracticeEditLock } from "@/lib/practice-edit-lock"

function toDateInput(d: Date | null | undefined): string {
  if (!d) return ""
  return new Date(d).toISOString().slice(0, 10)
}

export default async function PracticePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    q?: string
    tag?: string | string[]
    view?: string
    month?: string
    week?: string
  }>
}) {
  const { id } = await params
  const { q, tag, view, month, week } = await searchParams
  const session = await getServerSession(authOptions)
  if (!session) redirect("/signin?callbackUrl=/practices")

  const isCoach = await isStaffUi(session.user.role)

  const backParams = new URLSearchParams()
  if (q?.trim()) backParams.set("q", q.trim())
  const tags = Array.isArray(tag) ? tag : tag ? [tag] : []
  for (const t of tags) {
    const value = t.trim()
    if (value) backParams.append("tag", value)
  }
  if (view === "list") {
    backParams.set("view", "list")
  } else if (view === "month" || view === "calendar") {
    backParams.set("view", "month")
    if (month && /^\d{4}-\d{2}$/.test(month)) backParams.set("month", month)
  } else if (week && /^\d{4}-\d{2}-\d{2}$/.test(week)) {
    backParams.set("week", week)
  }
  const backHref = backParams.toString() ? `/practices?${backParams}` : "/practices"

  const practice = await prisma.practice.findUnique({
    where: { id },
    include: {
      sets: { orderBy: { order: "asc" } },
      comments: { orderBy: { createdAt: "asc" } },
      editLockedBy: { select: { id: true, name: true } },
    },
  })

  if (!practice || (!practice.published && !isCoach)) notFound()

  const totalDistance = practice.sets.reduce((sum, s) => sum + (s.distance ?? 0), 0)
  const initialEditLock = serializePracticeEditLock(practice, session.user.id)

  const initial: PracticeFormState = {
    title: practice.title,
    date: toDateInput(practice.date),
    focus: practice.focus ?? "",
    published: practice.published,
    sets: practice.sets.map((s) => ({
      id: s.id,
      title: s.title ?? "",
      content: s.content,
      notes: s.notes ?? "",
      tags: s.tags,
      distance: s.distance != null ? String(s.distance) : "",
    })),
  }

  return (
    <PracticeDetail
      practiceId={practice.id}
      title={practice.title}
      published={practice.published}
      dateIso={practice.date ? practice.date.toISOString() : null}
      focus={practice.focus}
      sets={practice.sets.map((s) => ({
        id: s.id,
        title: s.title,
        content: s.content,
        notes: s.notes,
        tags: s.tags,
        distance: s.distance,
      }))}
      totalDistance={totalDistance}
      initial={initial}
      backHref={backHref}
      isCoach={isCoach}
      currentUserId={session.user.id}
      comments={practice.comments.map((c) => ({
        id: c.id,
        authorName: c.authorName,
        authorId: c.authorId,
        body: c.body,
        parentId: c.parentId,
        createdAt: c.createdAt.toISOString(),
      }))}
      initialEditLock={initialEditLock}
    />
  )
}
