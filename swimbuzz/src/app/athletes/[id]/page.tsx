import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import { compareSwimPb } from "@/lib/swim-parse"
import AddSwimForm from "./AddSwimForm"
import PersonalBestsGrid from "./PersonalBestsGrid"
import SwimHistory from "./SwimHistory"

export default async function AthletePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params  // 👈 await it
    const session = await getServerSession(authOptions)
    if (!session) redirect("/api/auth/signin")

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

  const isCoach = ["COACH", "MEET_DIRECTOR"].includes(session.user.role)

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

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center font-medium text-indigo-700">
          {athlete.firstName[0]}{athlete.lastName[0]}
        </div>
        <div>
          <h1 className="text-xl font-medium">{athlete.firstName} {athlete.lastName}</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400">{athlete.user?.email}</p>
          {athlete.swimCloudId && (
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">
              SwimCloud ID: {athlete.swimCloudId}
            </p>
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
      
      {isCoach && <AddSwimForm athleteId={athlete.id} swimCloudId={athlete.swimCloudId ?? null} />}
    </main>
  )
}