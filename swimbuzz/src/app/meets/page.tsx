import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"
import { formatDateRange } from "@/lib/utils"
import CreateMeetButton from "./CreateMeetButton"

export default async function MeetsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/api/auth/signin")

  const isCoach = ["COACH", "MEET_DIRECTOR"].includes(session.user.role)

  const meets = await prisma.meet.findMany({
    orderBy: { startDate: "desc" },
    include: { _count: { select: { swims: true } } },
  })

  const now = Date.now()

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium">Meets</h1>
        {isCoach && <CreateMeetButton />}
      </div>

      {meets.length === 0 ? (
        <div className="border rounded-xl px-4 py-12 text-center text-sm text-gray-500 dark:text-zinc-400 bg-white dark:bg-zinc-900">
          No meets yet.{isCoach ? " Create one to start tracking results." : ""}
        </div>
      ) : (
        <div className="divide-y border rounded-xl overflow-hidden bg-white dark:bg-zinc-900">
          {meets.map((m) => {
            const end = m.endDate ?? m.startDate
            const upcoming = new Date(end).getTime() >= now
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
                  <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">{m.course}</p>
                  <p className="text-xs text-gray-400 dark:text-zinc-500">
                    {m._count.swims} swim{m._count.swims === 1 ? "" : "s"}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </main>
  )
}
