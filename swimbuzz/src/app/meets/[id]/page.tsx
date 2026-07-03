import { Suspense } from "react"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { formatDateRange, formatTime } from "@/lib/utils"
import { compareSwimEvents } from "@/lib/swim-parse"
import ImportMeetButton from "@/app/athletes/ImportMeetButton"
import ImportSwimPhoneButton from "@/app/athletes/ImportSwimPhoneButton"
import MeetActions from "./MeetActions"
import type { MeetFormState } from "../MeetFields"

function toDateInput(d: Date | null | undefined): string {
  if (!d) return ""
  return new Date(d).toISOString().slice(0, 10)
}

const RESOURCE_LINKS: { key: keyof MeetLinks; label: string }[] = [
  { key: "packetUrl", label: "Meet packet" },
  { key: "psychSheetUrl", label: "Psych sheet" },
  { key: "heatSheetUrl", label: "Heat sheet" },
  { key: "resultsUrl", label: "Results" },
]

type MeetLinks = {
  packetUrl: string | null
  psychSheetUrl: string | null
  heatSheetUrl: string | null
  resultsUrl: string | null
}

export default async function MeetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) redirect("/api/auth/signin")

  const isCoach = ["COACH", "MEET_DIRECTOR"].includes(session.user.role)

  const meet = await prisma.meet.findUnique({
    where: { id },
    include: {
      swims: {
        include: { athlete: { select: { id: true, firstName: true, lastName: true } } },
      },
    },
  })

  if (!meet) notFound()

  // Group results into a roster keyed by athlete.
  const byAthlete = new Map<
    string,
    { id: string; name: string; swims: typeof meet.swims }
  >()
  for (const swim of meet.swims) {
    const key = swim.athleteId
    if (!byAthlete.has(key)) {
      byAthlete.set(key, {
        id: swim.athlete.id,
        name: `${swim.athlete.lastName}, ${swim.athlete.firstName}`,
        swims: [],
      })
    }
    byAthlete.get(key)!.swims.push(swim)
  }
  const roster = [...byAthlete.values()].sort((a, b) => a.name.localeCompare(b.name))
  for (const entry of roster) {
    entry.swims.sort((a, b) => compareSwimEvents(a.event, b.event))
  }

  const initial: MeetFormState = {
    name: meet.name,
    location: meet.location ?? "",
    startDate: toDateInput(meet.startDate),
    endDate: toDateInput(meet.endDate),
    course: meet.course,
    season: String(meet.season),
    description: meet.description ?? "",
    packetUrl: meet.packetUrl ?? "",
    psychSheetUrl: meet.psychSheetUrl ?? "",
    heatSheetUrl: meet.heatSheetUrl ?? "",
    resultsUrl: meet.resultsUrl ?? "",
  }

  const links = RESOURCE_LINKS.filter((l) => meet[l.key])

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/meets"
            className="text-xs text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300"
          >
            ← All meets
          </Link>
          <h1 className="mt-1 text-2xl font-medium">{meet.name}</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            {formatDateRange(meet.startDate, meet.endDate)}
            {meet.location ? ` · ${meet.location}` : ""}
          </p>
          <p className="mt-0.5 text-xs text-gray-400 dark:text-zinc-500">
            {meet.course} · {meet.season} season
          </p>
        </div>
        {isCoach && <MeetActions meetId={meet.id} initial={initial} meetName={meet.name} />}
      </div>

      {meet.description && (
        <p className="text-sm text-gray-600 dark:text-zinc-300 whitespace-pre-line">
          {meet.description}
        </p>
      )}

      {/* Resource links */}
      {links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {links.map((l) => (
            <a
              key={l.key}
              href={meet[l.key] as string}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 border rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-950 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5 shrink-0"
                aria-hidden="true"
              >
                <path d="M14 3h7v7" />
                <path d="M10 14 21 3" />
                <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
              </svg>
              {l.label}
            </a>
          ))}
        </div>
      )}

      {/* Import (coach) */}
      {isCoach && (
        <section>
          <h2 className="text-sm font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-3">
            Import results
          </h2>
          <div className="flex flex-wrap gap-3">
            <Suspense fallback={null}>
              <ImportMeetButton meetId={meet.id} seasonYear={String(meet.season)} />
            </Suspense>
            <Suspense fallback={null}>
              <ImportSwimPhoneButton meetId={meet.id} seasonYear={String(meet.season)} />
            </Suspense>
          </div>
        </section>
      )}

      {/* Roster + results */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide">
            Roster &amp; results
          </h2>
          <span className="text-xs text-gray-400 dark:text-zinc-500">
            {roster.length} athlete{roster.length === 1 ? "" : "s"} · {meet.swims.length} swim
            {meet.swims.length === 1 ? "" : "s"}
          </span>
        </div>

        {roster.length === 0 ? (
          <div className="border rounded-xl px-4 py-10 text-center text-sm text-gray-500 dark:text-zinc-400 bg-white dark:bg-zinc-900">
            No results imported yet.
            {isCoach ? " Use “Import results” above to add a PDF or SwimPhone link." : ""}
          </div>
        ) : (
          <div className="space-y-3">
            {roster.map((entry) => (
              <div
                key={entry.id}
                className="border rounded-xl overflow-hidden bg-white dark:bg-zinc-900"
              >
                <Link
                  href={`/athletes/${entry.id}`}
                  className="block px-4 py-2.5 text-sm font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors border-b dark:border-zinc-800"
                >
                  {entry.name}
                </Link>
                <ul className="divide-y dark:divide-zinc-800">
                  {entry.swims.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between px-4 py-2 text-sm"
                    >
                      <span className="text-gray-700 dark:text-zinc-300">
                        {s.event}
                        {s.tags ? (
                          <span className="ml-2 text-[10px] uppercase rounded bg-gray-100 dark:bg-zinc-800 px-1.5 py-0.5 text-gray-500 dark:text-zinc-400">
                            {s.tags}
                          </span>
                        ) : null}
                        {s.course !== meet.course ? (
                          <span className="ml-2 text-xs text-gray-400">{s.course}</span>
                        ) : null}
                      </span>
                      <span className="font-mono text-gray-900 dark:text-zinc-100">
                        {formatTime(s.timeMs)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
