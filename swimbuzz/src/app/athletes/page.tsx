import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { redirect } from "next/navigation"
import Link from "next/link"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"

export default async function AthletesPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/api/auth/signin")

  const athletes = await prisma.athlete.findMany({
    include: {
      user: { select: { name: true, email: true, image: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  })

  const isCoach = ["COACH", "MEET_DIRECTOR"].includes(session.user.role)

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-medium">Roster</h1>
        {isCoach && (
          <Link
            href="/athletes/new"
            className="text-sm px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            Add athlete
          </Link>
        )}
      </div>

      <div className="divide-y border rounded-xl overflow-hidden">
        {athletes.map((a) => (
          <Link
            key={a.id}
            href={`/athletes/${a.id}`}
            className="flex items-center gap-4 px-4 py-3 bg-white hover:bg-gray-50 transition-colors"
          >
            <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-medium text-indigo-700 shrink-0">
              {a.firstName[0]}{a.lastName[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{a.lastName}, {a.firstName}</p>
              <p className="text-xs text-gray-500">{a.user?.email}</p>
            </div>
            {a.gradYear && (
              <span className="text-xs text-gray-400">'{String(a.gradYear).slice(2)}</span>
            )}
          </Link>
        ))}

        {athletes.length === 0 && (
          <p className="text-sm text-gray-500 px-4 py-8 text-center">
            No athletes yet. Add your first one.
          </p>
        )}
      </div>
    </main>
  )
}