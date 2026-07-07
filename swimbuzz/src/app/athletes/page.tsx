import { Suspense } from "react"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import SyncRosterButton from "./SyncRosterButton"
import SyncTimesButton from "./SyncTimesButton"
import AddAthleteButton from "./AddAthleteButton"
import RosterFilters from "./RosterFilters"
import { currentSeason, parseSeason } from "@/lib/season"

export default async function AthletesPage({
    searchParams,
  }: {
    searchParams: Promise<{ gender?: string; season?: string; year?: string }>
  }) {
    const { gender, season: seasonParam, year: legacyYear } = await searchParams

    const season =
      parseSeason(seasonParam ?? legacyYear) ?? currentSeason()

    // if no params, redirect to defaults so URL and UI always match
    if (!gender || (!seasonParam && !legacyYear)) {
        redirect(`/athletes?gender=${gender ?? "M"}&season=${season}`)
    }

    const session = await getServerSession(authOptions)
    if (!session) redirect("/api/auth/signin")

    const genderFilter = gender === "F" ? "F" : "M"
  
    const athletes = await prisma.athlete.findMany({
        where: {
          gender: genderFilter,
          seasons: { has: season },
        },
      include: {
        user: { select: { name: true, email: true } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    })
  
    const isCoach = ["COACH", "EXEC"].includes(session.user.role)
  
    return (
      <main className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-medium">Roster</h1>
            <Suspense fallback={null}>
              <RosterFilters />
            </Suspense>
          </div>
          {isCoach && (
            <div className="flex items-center gap-3 flex-wrap">
              <SyncRosterButton />
              <Suspense fallback={null}>
                <SyncTimesButton />
              </Suspense>
              <Suspense fallback={null}>
                <AddAthleteButton />
              </Suspense>
            </div>
          )}
        </div>
  
        <div className="divide-y border rounded-xl overflow-hidden bg-white dark:bg-zinc-900">
          {athletes.map((a) => (
            <Link
              key={a.id}
              href={`/athletes/${a.id}`}
              className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-950 transition-colors"
            >
              <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-medium text-indigo-700 shrink-0">
                {a.firstName[0]}{a.lastName[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-gray-900 dark:text-zinc-100">{a.lastName}, {a.firstName}</p>
              </div>
            </Link>
          ))}
  
          {athletes.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-zinc-400 px-4 py-8 text-center">
              No athletes found for this gender and year.
            </p>
          )}
        </div>
      </main>
    )
  }