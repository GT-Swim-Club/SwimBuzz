import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { compareSwimPb } from "@/lib/swim-parse"
import AddSwimForm from "./AddSwimForm"
import PersonalBestsGrid from "./PersonalBestsGrid"
import SwimHistory from "./SwimHistory"
import EditNicknamesForm from "./EditNicknamesForm"
import AthleteActions from "./AthleteActions"
import { isStaffUi } from "@/lib/athlete-view-server"

export default async function AthletePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params  // 👈 await it
    const session = await getServerSession(authOptions)
    if (!session) redirect("/signin")

    const athlete = await prisma.athlete.findUnique({
        where: { id },  // 👈 use the destructured id
        include: {
        user: { select: { name: true, email: true } },
        swims: {
            orderBy: { date: "desc" },
        },
        },
    })

    if (!athlete) notFound()

  const isCoach = await isStaffUi(session.user.role)

  // group PBs by event
  const pbMap = new Map<string, typeof athlete.swims[0]>()
  for (const swim of [...athlete.swims].sort((a, b) => a.timeMs - b.timeMs)) {
    const key = `${swim.event}-${swim.course}`
    if (!pbMap.has(key)) pbMap.set(key, swim)
  }

  const personalBests = [...pbMap.values()].sort(compareSwimPb)

  const historySwims = athlete.swims.map((swim) => ({
    id: swim.id,
    event: swim.event,
    course: swim.course,
    timeMs: swim.timeMs,
    tags: swim.tags ?? "",
    meet: swim.meet ?? "",
    date: swim.date.toISOString(),
    source: swim.source,
  }))

  const rosterHref = `/athletes?gender=${athlete.gender}`

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <div>
        <Link
          href={rosterHref}
          className="text-xs text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300"
        >
          ← Roster
        </Link>
        <div className="mt-1 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center font-medium text-indigo-700">
            {athlete.firstName[0]}{athlete.lastName[0]}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-medium">
              {athlete.swimCloudId ? (
                <a
                  href={`https://www.swimcloud.com/swimmer/${athlete.swimCloudId}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                >
                  {athlete.firstName} {athlete.lastName}
                </a>
              ) : (
                <>
                  {athlete.firstName} {athlete.lastName}
                </>
              )}
              {athlete.nicknames.length > 0 && (
                <span className="font-normal text-gray-500 dark:text-zinc-400">
                  {" "}({athlete.nicknames.join(", ")})
                </span>
              )}
            </h1>
            <p className="text-sm text-gray-500 dark:text-zinc-400">{athlete.user?.email}</p>
            {athlete.swimCloudId && (
              <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">
                SwimCloud ID: {athlete.swimCloudId}
              </p>
            )}
          </div>
          {isCoach && (
            <AthleteActions
              athleteId={athlete.id}
              firstName={athlete.firstName}
              lastName={athlete.lastName}
              email={athlete.user?.email ?? ""}
              swimCloudId={athlete.swimCloudId ?? null}
            />
          )}
        </div>
      </div>

      {/* PB grid */}
      <section>
        <h2 className="text-sm font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-4">
          Personal bests
        </h2>
        <PersonalBestsGrid swims={personalBests} />
      </section>

      {/* Swim history */}
      <section>
        <h2 className="text-sm font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-3">
          History
        </h2>
        <SwimHistory swims={historySwims} isCoach={isCoach} />
      </section>
      
      {isCoach && (
        <section>
          <h2 className="text-sm font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-3">
            Alternate names
          </h2>
          <EditNicknamesForm
            athleteId={athlete.id}
            initialNicknames={athlete.nicknames}
          />
        </section>
      )}

      {isCoach && (
        <AddSwimForm
          athleteId={athlete.id}
          swimCloudId={athlete.swimCloudId ?? null}
          timesSyncedAt={athlete.timesSyncedAt?.toISOString() ?? null}
        />
      )}
    </main>
  )
}