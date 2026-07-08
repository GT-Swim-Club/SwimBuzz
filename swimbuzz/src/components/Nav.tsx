import Link from "next/link"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import ThemeToggle from "@/components/ThemeToggle"
import SignOutButton from "@/components/SignOutButton"
import { formatRoleLabel } from "@/lib/auth-roles"


export default async function Nav() {
  const session = await getServerSession(authOptions)

  return (
    <nav className="border-b bg-white dark:bg-zinc-900 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <Link href="/" className="font-semibold text-sm tracking-tight hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
          SwimBuzz
        </Link>
        {session && (
          <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-zinc-400">
            <Link href="/athletes" className="hover:text-gray-900 dark:hover:text-zinc-100 transition-colors">Roster</Link>
            <Link href="/meets" className="hover:text-gray-900 dark:hover:text-zinc-100 transition-colors">Meets</Link>
            <Link href="/practices" className="hover:text-gray-900 dark:hover:text-zinc-100 transition-colors">Practices</Link>
            <Link href="/relays" className="hover:text-gray-900 dark:hover:text-zinc-100 transition-colors">Relays</Link>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <ThemeToggle />
        {session ? (
          <>
            <span className="text-xs text-gray-400 dark:text-zinc-500">
              {session.user.name}
              <span className="mx-1.5 text-gray-300 dark:text-zinc-600">·</span>
              {formatRoleLabel(session.user.role)}
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