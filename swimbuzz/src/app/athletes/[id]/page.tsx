import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import { formatTime, formatSwimDate } from "@/lib/utils"
import AddSwimForm from "./AddSwimForm"
import DeleteSwimButton from "./DeleteSwimButton"

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

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center font-medium text-indigo-700">
          {athlete.firstName[0]}{athlete.lastName[0]}
        </div>
        <div>
          <h1 className="text-xl font-medium">{athlete.firstName} {athlete.lastName}</h1>
          <p className="text-sm text-gray-500 dark:text-zinc-400">{athlete.user?.email}</p>
        </div>
      </div>

      {/* PB grid */}
      <section>
        <h2 className="text-sm font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-3">Personal bests</h2>
        {pbMap.size === 0 ? (
          <p className="text-sm text-gray-400">No times recorded yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[...pbMap.entries()].map(([key, swim]) => (
              <div key={key} className="border rounded-lg px-3 py-2">
                <p className="text-xs text-gray-500 dark:text-zinc-400">{swim.event} ({swim.course})</p>
                <p className="text-lg font-medium">{formatTime(swim.timeMs)}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Swim history */}
      <section>
        <h2 className="text-sm font-medium text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-3">History</h2>
        <div className="divide-y border rounded-xl overflow-hidden">
            <div className={`grid ${isCoach ? "grid-cols-[75px_20px_90px_20px_310px_80px_10px]" : "grid-cols-[75px_20px_90px_20px_1fr_100px]"} px-4 py-2 gap-4 border-b border-gray-100 dark:border-zinc-800`}>
                <span className="text-xs font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wide">Event</span>
                <span className="text-xs font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wide">Course</span>
                <span className="text-xs font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wide text-right">Time</span>
                <span className="text-xs font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wide"></span>
                <span className="text-xs font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wide">Meet</span>
                <span className="text-xs font-medium text-gray-400 dark:text-zinc-500 uppercase tracking-wide">Date</span>
                {isCoach && <span />}
            </div>
          {athlete.swims.map((swim) => (
            <div key={swim.id} className={`grid ${isCoach ? "grid-cols-[75px_20px_90px_20px_310px_80px_10px]" : "grid-cols-[75px_20px_90px_20px_1fr_100px]"} items-center px-4 py-2 bg-white dark:bg-zinc-900 text-sm gap-4`}>
            <span className="font-medium text-gray-900 dark:text-zinc-100">{swim.event} </span>
            <span className="text-gray-600 dark:text-zinc-400 text-xs">{swim.course}</span>
            <span className="font-mono text-right text-gray-900 dark:text-zinc-100">{formatTime(swim.timeMs)}</span>
            <span className="font-mono text-gray-900 dark:text-zinc-100">{swim.tags ?? ""}</span>
            <span className="text-gray-600 dark:text-zinc-400 truncate text-xs">{swim.meet ?? "—"}</span>
            <span className="text-gray-600 dark:text-zinc-400 text-xs">
              {formatSwimDate(swim.date)}
            </span>
            {isCoach && swim.source === "manual" && (
              <div className="flex justify-end">
                <DeleteSwimButton
                  swimId={swim.id}
                  event={swim.event}
                  course={swim.course}
                  timeLabel={formatTime(swim.timeMs)}
                  dateLabel={formatSwimDate(swim.date)}
                  meet={swim.meet}
                />
              </div>
            )}
          </div>
          ))}
        </div>
      </section>
      
      {isCoach && <AddSwimForm athleteId={athlete.id} swimCloudId={athlete.swimCloudId ?? null} />}
    </main>
  )
}