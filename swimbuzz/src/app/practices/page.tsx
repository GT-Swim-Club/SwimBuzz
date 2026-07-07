import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Prisma } from "@prisma/client"
import { formatSwimDate } from "@/lib/utils"
import { SET_TAGS } from "@/lib/practice-tags"
import { isStaffRole } from "@/lib/auth-roles"
import PracticeEditor from "./PracticeEditor"

export default async function PracticesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/api/auth/signin?callbackUrl=/practices")

  const isCoach = isStaffRole(session.user.role)
  const { q, tag } = await searchParams
  const query = q?.trim() ?? ""
  const activeTag = tag?.trim() ?? ""

  const and: Prisma.PracticeWhereInput[] = []
  if (!isCoach) and.push({ published: true })
  if (query) {
    const contains = { contains: query, mode: "insensitive" as const }
    and.push({
      OR: [
        { title: contains },
        { focus: contains },
        {
          sets: {
            some: { OR: [{ title: contains }, { content: contains }, { notes: contains }] },
          },
        },
      ],
    })
  }
  if (activeTag) and.push({ sets: { some: { tags: { has: activeTag } } } })

  const practices = await prisma.practice.findMany({
    where: and.length ? { AND: and } : undefined,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: {
      sets: { select: { tags: true, distance: true } },
      _count: { select: { sets: true } },
    },
  })

  function buildHref(next: { q?: string; tag?: string }) {
    const params = new URLSearchParams()
    const qv = next.q ?? query
    const tv = next.tag ?? activeTag
    if (qv) params.set("q", qv)
    if (tv) params.set("tag", tv)
    const s = params.toString()
    return s ? `/practices?${s}` : "/practices"
  }

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium">Practices</h1>
        {isCoach && <PracticeEditor triggerLabel="+ New practice" />}
      </div>

      {/* Search */}
      <div className="space-y-3">
        <form action="/practices" method="get" className="flex gap-2">
          {activeTag && <input type="hidden" name="tag" value={activeTag} />}
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search practices and sets…"
            className="flex-1 rounded-lg border px-3 py-2 text-sm dark:bg-zinc-950 dark:border-zinc-700"
          />
          <button
            type="submit"
            className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-950 transition-colors"
          >
            Search
          </button>
        </form>

        <div className="flex flex-wrap gap-1.5">
          <Link
            href={buildHref({ tag: "" })}
            className={
              "text-xs px-2.5 py-1 rounded-full border transition-colors " +
              (!activeTag
                ? "bg-gray-900 border-gray-900 text-white dark:bg-zinc-100 dark:border-zinc-100 dark:text-zinc-900"
                : "border-gray-300 dark:border-zinc-700 text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800")
            }
          >
            All
          </Link>
          {SET_TAGS.map((t) => (
            <Link
              key={t}
              href={buildHref({ tag: activeTag === t ? "" : t })}
              className={
                "text-xs px-2.5 py-1 rounded-full border transition-colors " +
                (activeTag === t
                  ? "bg-indigo-600 border-indigo-600 text-white"
                  : "border-gray-300 dark:border-zinc-700 text-gray-600 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800")
              }
            >
              {t}
            </Link>
          ))}
        </div>
      </div>

      {practices.length === 0 ? (
        <div className="border rounded-xl px-4 py-12 text-center text-sm text-gray-500 dark:text-zinc-400 bg-white dark:bg-zinc-900">
          {query || activeTag
            ? "No practices match your search."
            : isCoach
              ? "No practices yet. Create one to get started."
              : "No practices posted yet."}
        </div>
      ) : (
        <div className="divide-y border rounded-xl overflow-hidden bg-white dark:bg-zinc-900">
          {practices.map((p) => {
            const tags = [...new Set(p.sets.flatMap((s) => s.tags))]
            const totalDistance = p.sets.reduce((sum, s) => sum + (s.distance ?? 0), 0)
            return (
              <Link
                key={p.id}
                href={`/practices/${p.id}`}
                className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-950 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm text-gray-900 dark:text-zinc-100 truncate">
                      {p.title}
                    </p>
                    {isCoach && !p.published && (
                      <span className="text-[10px] uppercase tracking-wide rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 dark:bg-amber-950 dark:text-amber-300 shrink-0">
                        Draft
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-zinc-400">
                    {p.date ? formatSwimDate(p.date) : "No date"}
                    {" · "}
                    {p._count.sets} set{p._count.sets === 1 ? "" : "s"}
                    {totalDistance > 0 ? ` · ${totalDistance.toLocaleString()} total` : ""}
                  </p>
                  {tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {tags.slice(0, 6).map((t) => (
                        <span
                          key={t}
                          className="text-[10px] uppercase tracking-wide rounded bg-gray-100 dark:bg-zinc-800 px-1.5 py-0.5 text-gray-500 dark:text-zinc-400"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-gray-300 dark:text-zinc-600">→</span>
              </Link>
            )
          })}
        </div>
      )}
    </main>
  )
}
