import Link from "next/link"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import ThemeToggle from "@/components/ThemeToggle"
import SignOutButton from "@/components/SignOutButton"
import RunScraperButton from "@/components/RunScraperButton"
import AthleteViewToggle from "@/components/AthleteViewToggle"
import { formatRoleLabel, isStaffRole } from "@/lib/auth-roles"
import {
  getAthleteViewAthlete,
  isAthleteViewEnabled,
} from "@/lib/athlete-view-server"
import { prisma } from "@/lib/prisma"

export default async function Nav() {
  const session = await getServerSession(authOptions)
  const isStaff = !!session && isStaffRole(session.user.role)
  const athleteView = isStaff ? await isAthleteViewEnabled() : false
  const showStaffTools = isStaff && !athleteView

  const previewAthlete = isStaff && athleteView ? await getAthleteViewAthlete() : null
  const previewAthletes = isStaff
    ? await prisma.athlete.findMany({
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        select: { id: true, firstName: true, lastName: true },
      })
    : []

  return (
    <nav className="sticky top-0 z-40 border-b bg-white dark:bg-zinc-900 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <Link href="/" className="font-semibold text-sm tracking-tight hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
          SwimBuzz
        </Link>
        {session && (
          <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-zinc-400">
            <Link href="/athletes" className="hover:text-gray-900 dark:hover:text-zinc-100 transition-colors">Roster</Link>
            <Link href="/meets" className="hover:text-gray-900 dark:hover:text-zinc-100 transition-colors">Meets</Link>
            <Link href="/practices" className="hover:text-gray-900 dark:hover:text-zinc-100 transition-colors">Practices</Link>
            <Link href="/qualifiers" className="hover:text-gray-900 dark:hover:text-zinc-100 transition-colors">Nationals</Link>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        {isStaff ? (
          <AthleteViewToggle
            athletes={previewAthletes.map((a) => ({
              id: a.id,
              name: `${a.lastName}, ${a.firstName}`,
            }))}
            selectedAthleteId={previewAthlete?.id ?? null}
          />
        ) : null}
        {showStaffTools ? <RunScraperButton /> : null}
        <ThemeToggle />
        {session ? (
          <>
            <span className="text-xs text-gray-400 dark:text-zinc-500 hidden sm:inline">
              {session.user.name}
              <span className="mx-1.5 text-gray-300 dark:text-zinc-600">·</span>
              {previewAthlete
                ? `As ${previewAthlete.lastName}, ${previewAthlete.firstName}`
                : athleteView
                  ? "Athlete View"
                  : formatRoleLabel(session.user.role)}
            </span>
            <SignOutButton />
          </>
        ) : (
          <Link
            href="/signin"
            className="inline-flex items-center rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            Sign in
          </Link>
        )}
      </div>
    </nav>
  )
}
