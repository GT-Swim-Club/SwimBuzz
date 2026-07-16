import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { formatSwimDate } from "@/lib/utils"
import { isStaffUi } from "@/lib/athlete-view-server"
import PracticeActions from "./PracticeActions"
import CommentSection from "./CommentSection"
import type { PracticeFormState } from "../PracticeEditor"
import { FormattedText } from "@/components/FormattedText"

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
    tag?: string
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
  if (tag?.trim()) backParams.set("tag", tag.trim())
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
    },
  })

  if (!practice || (!practice.published && !isCoach)) notFound()

  const totalDistance = practice.sets.reduce((sum, s) => sum + (s.distance ?? 0), 0)

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
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href={backHref}
            className="text-xs text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300"
          >
            ← All practices
          </Link>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <h1 className="text-2xl font-medium">{practice.title}</h1>
            {isCoach && !practice.published && (
              <span className="text-[10px] uppercase tracking-wide rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 dark:bg-amber-950 dark:text-amber-300">
                Draft
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            {practice.date ? formatSwimDate(practice.date) : "No date"}
            {" · "}
            {practice.sets.length} set{practice.sets.length === 1 ? "" : "s"}
            {totalDistance > 0 ? ` · ${totalDistance.toLocaleString()} total` : ""}
          </p>
        </div>
        {isCoach && (
          <PracticeActions
            practiceId={practice.id}
            initial={initial}
            title={practice.title}
            published={practice.published}
          />
        )}
      </div>

      {practice.focus && (
        <div className="text-sm text-gray-600 dark:text-zinc-300 rounded-xl border border-gray-100 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-950/40 px-4 py-3">
          <FormattedText text={practice.focus} className="text-gray-600 dark:text-zinc-300" />
        </div>
      )}

      {/* Sets */}
      <div className="space-y-5">
        {practice.sets.map((set) => (
          <section
            key={set.id}
            className="rounded-2xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center flex-wrap gap-x-2 gap-y-1 min-w-0">
                <h2 className="font-medium text-gray-900 dark:text-zinc-100">
                  {set.title || "Set"}
                </h2>
                {set.tags.map((t) => (
                  <Link
                    key={t}
                    href={`/practices?tag=${encodeURIComponent(t)}`}
                    className="text-[10px] uppercase tracking-wide rounded-full bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
                  >
                    {t}
                  </Link>
                ))}
              </div>
              {set.distance != null && (
                <span className="text-xs text-gray-400 dark:text-zinc-500 shrink-0">
                  {set.distance.toLocaleString()}
                </span>
              )}
            </div>

            <div className="mt-3">
              <FormattedText text={set.content} />
            </div>

            {set.notes && (
              <div className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 px-3 py-2">
                <FormattedText
                  text={set.notes}
                  className="text-amber-900 dark:text-amber-200"
                />
              </div>
            )}
          </section>
        ))}
      </div>

      <CommentSection
        practiceId={practice.id}
        currentUserId={session.user.id}
        isCoach={isCoach}
        initialComments={practice.comments.map((c) => ({
          id: c.id,
          authorName: c.authorName,
          authorId: c.authorId,
          body: c.body,
          parentId: c.parentId,
          createdAt: c.createdAt.toISOString(),
        }))}
      />
    </main>
  )
}
