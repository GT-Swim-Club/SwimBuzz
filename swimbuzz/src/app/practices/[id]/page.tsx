import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { formatSwimDate } from "@/lib/utils"
import PracticeActions from "./PracticeActions"
import CommentSection from "./CommentSection"
import type { PracticeFormState } from "../PracticeEditor"

function toDateInput(d: Date | null | undefined): string {
  if (!d) return ""
  return new Date(d).toISOString().slice(0, 10)
}

export default async function PracticePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) redirect("/api/auth/signin?callbackUrl=/practices")

  const isCoach = ["COACH", "MEET_DIRECTOR"].includes(session.user.role)

  const practice = await prisma.practice.findUnique({
    where: { id },
    include: {
      sets: { orderBy: { order: "asc" } },
      comments: { orderBy: { createdAt: "asc" } },
    },
  })

  if (!practice) notFound()

  const totalDistance = practice.sets.reduce((sum, s) => sum + (s.distance ?? 0), 0)

  const initial: PracticeFormState = {
    title: practice.title,
    date: toDateInput(practice.date),
    focus: practice.focus ?? "",
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
            href="/practices"
            className="text-xs text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300"
          >
            ← All practices
          </Link>
          <h1 className="mt-1 text-2xl font-medium">{practice.title}</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            {practice.date ? formatSwimDate(practice.date) : "No date"}
            {" · "}
            {practice.sets.length} set{practice.sets.length === 1 ? "" : "s"}
            {totalDistance > 0 ? ` · ${totalDistance.toLocaleString()} total` : ""}
          </p>
        </div>
        {isCoach && (
          <PracticeActions practiceId={practice.id} initial={initial} title={practice.title} />
        )}
      </div>

      {practice.focus && (
        <p className="text-sm text-gray-600 dark:text-zinc-300 whitespace-pre-line rounded-xl border border-gray-100 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-950/40 px-4 py-3">
          {practice.focus}
        </p>
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

            <pre className="mt-3 whitespace-pre-wrap font-mono text-sm text-gray-800 dark:text-zinc-200">
              {set.content}
            </pre>

            {set.notes && (
              <div className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 px-3 py-2">
                <p className="text-sm text-amber-900 dark:text-amber-200 whitespace-pre-line">
                  {set.notes}
                </p>
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
          createdAt: c.createdAt.toISOString(),
        }))}
      />
    </main>
  )
}
