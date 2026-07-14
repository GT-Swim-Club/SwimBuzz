import { Suspense } from "react"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"
import LiveSearch from "@/components/LiveSearch"
import { formatDateRange } from "@/lib/utils"
import CreateMeetButton from "./CreateMeetButton"
import { isStaffUi } from "@/lib/athlete-view-server"
import { parseSeason, seasonEndYear } from "@/lib/season"
import { countMeetAthletes } from "@/lib/meet-sheet-summary"

export default async function MeetsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/signin")

  const isCoach = await isStaffUi(session.user.role)
  const { q } = await searchParams
  const query = q?.trim() ?? ""

  const meets = await prisma.meet.findMany({
    where: query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { location: { contains: query, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { startDate: "desc" },
    select: {
      id: true,
      name: true,
      location: true,
      startDate: true,
      endDate: true,
      course: true,
      season: true,
      psychSheetSummary: true,
      heatSheetSummary: true,
      entriesSheetSummary: true,
      relayResultsSummary: true,
      resultStatusesSummary: true,
      swims: { select: { athleteId: true } },
    },
  })

  const bySeason = new Map<string, typeof meets>()
  for (const meet of meets) {
    const season = parseSeason(meet.season) ?? meet.season
    const group = bySeason.get(season)
    if (group) group.push(meet)
    else bySeason.set(season, [meet])
  }

  const seasons = [...bySeason.keys()].sort((a, b) => {
    const aParsed = parseSeason(a)
    const bParsed = parseSeason(b)
    if (aParsed && bParsed) return seasonEndYear(bParsed) - seasonEndYear(aParsed)
    if (aParsed) return -1
    if (bParsed) return 1
    return b.localeCompare(a)
  })

  const now = Date.now()

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium">Meets</h1>
        {isCoach && <CreateMeetButton />}
      </div>

      <Suspense fallback={null}>
        <LiveSearch pathname="/meets" placeholder="Search meets by name or location…" />
      </Suspense>

      {meets.length === 0 ? (
        <div className="border rounded-xl px-4 py-12 text-center text-sm text-gray-500 dark:text-zinc-400 bg-white dark:bg-zinc-900">
          {query
            ? "No meets match your search."
            : `No meets yet.${isCoach ? " Create one to start tracking results." : ""}`}
        </div>
      ) : (
        <div className="space-y-8">
          {seasons.map((season) => {
            const seasonMeets = bySeason.get(season) ?? []
            return (
              <section key={season} className="space-y-3">
                <h2 className="text-sm font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide">
                  {season}
                  <span className="ml-2 font-normal normal-case tracking-normal text-gray-400 dark:text-zinc-500">
                    {seasonMeets.length} meet{seasonMeets.length === 1 ? "" : "s"}
                  </span>
                </h2>
                <div className="divide-y border rounded-xl overflow-hidden bg-white dark:bg-zinc-900">
                  {seasonMeets.map((m) => {
                    const end = m.endDate ?? m.startDate
                    const upcoming = new Date(end).getTime() >= now
                    const athleteCount = countMeetAthletes({
                      psychSheetSummary: m.psychSheetSummary,
                      heatSheetSummary: m.heatSheetSummary,
                      entriesSheetSummary: m.entriesSheetSummary,
                      relayResultsSummary: m.relayResultsSummary,
                      resultStatusesSummary: m.resultStatusesSummary,
                      swimAthleteIds: m.swims.map((s) => s.athleteId),
                    })
                    return (
                      <Link
                        key={m.id}
                        href={`/meets/${m.id}`}
                        className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-950 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm text-gray-900 dark:text-zinc-100 truncate">
                              {m.name}
                            </p>
                            {upcoming && (
                              <span className="text-[10px] uppercase tracking-wide rounded-full bg-indigo-100 text-indigo-700 px-2 py-0.5 dark:bg-indigo-950 dark:text-indigo-300">
                                Upcoming
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 dark:text-zinc-400">
                            {formatDateRange(m.startDate, m.endDate)}
                            {m.location ? ` · ${m.location}` : ""}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                            {m.course}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-zinc-500">
                            {athleteCount} athlete{athleteCount === 1 ? "" : "s"}
                          </p>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </main>
  )
}
