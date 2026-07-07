import Link from "next/link"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import ThemeToggle from "@/components/ThemeToggle"
import { formatRoleLabel } from "@/lib/auth-roles"


export default async function Nav() {
  const session = await getServerSession(authOptions)

  return (
    <nav className="border-b bg-white dark:bg-zinc-900 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <span className="font-semibold text-sm tracking-tight">SwimBuzz</span>
        <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-zinc-400">
          <Link href="/athletes" className="hover:text-gray-900 dark:text-zinc-100 transition-colors">Roster</Link>
          <Link href="/meets" className="hover:text-gray-900 dark:text-zinc-100 transition-colors">Meets</Link>
          <Link href="/practices" className="hover:text-gray-900 dark:text-zinc-100 transition-colors">Practices</Link>
          <Link href="/relays" className="hover:text-gray-900 dark:text-zinc-100 transition-colors">Relays</Link>
        </div>
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
            <Link
              href="/api/auth/signout?callbackUrl=/"
              className="text-xs text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:text-zinc-100 transition-colors"
            >
              Sign out
            </Link>
          </>
        ) : (
          <Link href="/api/auth/signin?callbackUrl=/athletes" className="text-xs text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:text-zinc-100">
            Sign in
          </Link>
        )}
      </div>    
    </nav>
  )
}