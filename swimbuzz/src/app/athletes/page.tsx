import { Suspense } from "react"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import ImportRosterButton from "./ImportRosterButton"
import SyncTimesButton from "./SyncTimesButton"
import AddAthleteButton from "./AddAthleteButton"
import RosterFilters, { RosterSearch } from "./RosterFilters"
import { currentSeason, parseSeason } from "@/lib/season"
import { isStaffUi, resolveViewerAthleteId } from "@/lib/athlete-view-server"

function matchesAthleteQuery(
    athlete: { firstName: string; lastName: string; nicknames: string[] },
    query: string
  ) {
    const q = query.toLowerCase()
    const haystack = [
      athlete.firstName,
      athlete.lastName,
      `${athlete.firstName} ${athlete.lastName}`,
      `${athlete.lastName}, ${athlete.firstName}`,
      ...athlete.nicknames,
    ]
      .join(" ")
      .toLowerCase()
    return haystack.includes(q)
  }

export default async function AthletesPage({
    searchParams,
  }: {
    searchParams: Promise<{ gender?: string; season?: string; year?: string; q?: string }>
  }) {
    const { gender, season: seasonParam, year: legacyYear, q } = await searchParams
    const query = q?.trim() ?? ""

    const season =
      parseSeason(seasonParam ?? legacyYear) ?? currentSeason()

    // if no params, redirect to defaults so URL and UI always match
    if (!gender || (!seasonParam && !legacyYear)) {
        const params = new URLSearchParams({
          gender: gender ?? "all",
          season,
        })
        if (query) params.set("q", query)
        redirect(`/athletes?${params.toString()}`)
    }

    const session = await getServerSession(authOptions)
    if (!session) redirect("/signin")

    const genderFilter =
      gender === "F" ? "F" : gender === "M" ? "M" : null
  
    const athletes = await prisma.athlete.findMany({
        where: {
          ...(genderFilter ? { gender: genderFilter } : {}),
          seasons: { has: season },
        },
      include: {
        user: { select: { name: true, email: true } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    })

    const filteredAthletes = query
      ? athletes.filter((a) => matchesAthleteQuery(a, query))
      : athletes

    const viewerAthleteId = await resolveViewerAthleteId(session.user.id)
    const sortedAthletes =
      viewerAthleteId && filteredAthletes.some((a) => a.id === viewerAthleteId)
        ? [
            ...filteredAthletes.filter((a) => a.id === viewerAthleteId),
            ...filteredAthletes.filter((a) => a.id !== viewerAthleteId),
          ]
        : filteredAthletes
  
    const isCoach = await isStaffUi(session.user.role)
    const showGender = genderFilter == null
  
    return (
      <main className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-medium">Roster</h1>
            <Suspense fallback={null}>
              <RosterFilters count={sortedAthletes.length} />
            </Suspense>
          </div>
          {isCoach && (
            <div className="flex items-center gap-3 flex-wrap">
              <Suspense fallback={null}>
                <ImportRosterButton />
              </Suspense>
              <Suspense fallback={null}>
                <SyncTimesButton />
              </Suspense>
              <Suspense fallback={null}>
                <AddAthleteButton />
              </Suspense>
            </div>
          )}
        </div>

        <Suspense fallback={null}>
          <RosterSearch />
        </Suspense>
  
        <div className="divide-y border rounded-xl overflow-hidden bg-white dark:bg-zinc-900">
          {sortedAthletes.map((a) => {
            const isYou = a.id === viewerAthleteId
            return (
            <Link
              key={a.id}
              href={`/athletes/${a.id}`}
              className={
                "flex items-center gap-4 px-4 py-3 hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-950 transition-colors" +
                (isYou ? " bg-indigo-50/70 dark:bg-indigo-950/30" : "")
              }
            >
              <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-medium text-indigo-700 shrink-0 dark:bg-indigo-950 dark:text-indigo-300">
                {a.firstName[0]}{a.lastName[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-gray-900 dark:text-zinc-100">
                  {a.lastName}, {a.firstName}
                  {isYou && (
                    <span className="font-normal text-indigo-600 dark:text-indigo-400">
                      {" "}(you)
                    </span>
                  )}
                  {a.nicknames.length > 0 && (
                    <span className="font-normal text-gray-500 dark:text-zinc-400">
                      {" "}({a.nicknames.join(", ")})
                    </span>
                  )}
                </p>
              </div>
              {showGender ? (
                <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-zinc-500 shrink-0">
                  {a.gender === "F" ? "Women" : "Men"}
                </span>
              ) : null}
            </Link>
            )
          })}
  
          {sortedAthletes.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-zinc-400 px-4 py-8 text-center">
              {query
                ? `No athletes matching “${query}”.`
                : `No athletes found for this ${showGender ? "season" : "gender and season"}.`}
            </p>
          )}
        </div>
      </main>
    )
  }