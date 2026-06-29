import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import { formatTime } from "@/lib/utils"
import AddSwimForm from "./AddSwimForm"

export default async function AthletePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params  // 👈 await it
    const session = await getServerSession(authOptions)
    if (!session) redirect("/api/auth/signin")

    const athlete = await prisma.athlete.findUnique({
        where: { id },  // 👈 use the destructured id
        include: {
        user: { select: { name: true, email: true } },
        swims: {
            include: { meet: { select: { name: true } } },
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

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center font-medium text-indigo-700">
          {athlete.firstName[0]}{athlete.lastName[0]}
        </div>
        <div>
          <h1 className="text-xl font-medium">{athlete.firstName} {athlete.lastName}</h1>
          <p className="text-sm text-gray-500">{athlete.user?.email}</p>
        </div>
      </div>

      {/* PB grid */}
      <section>
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Personal bests</h2>
        {pbMap.size === 0 ? (
          <p className="text-sm text-gray-400">No times recorded yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[...pbMap.entries()].map(([key, swim]) => (
              <div key={key} className="border rounded-lg px-3 py-2">
                <p className="text-xs text-gray-500">{swim.event} ({swim.course})</p>
                <p className="text-lg font-medium">{formatTime(swim.timeMs)}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Swim history */}
      <section>
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">History</h2>
        <div className="divide-y border rounded-xl overflow-hidden">
          {athlete.swims.map((swim) => (
            <div key={swim.id} className="flex items-center justify-between px-4 py-2 bg-white text-sm">
              <span className="font-medium">{swim.event}</span>
              <span className="text-gray-500">{swim.course}</span>
              <span>{swim.meet?.name ?? "—"}</span>
              <span className="font-mono">{formatTime(swim.timeMs)}</span>
            </div>
          ))}
        </div>
      </section>
      
      {isCoach && <AddSwimForm athleteId={athlete.id} swimCloudId={athlete.swimCloudId ?? null} />}
    </main>
  )
}