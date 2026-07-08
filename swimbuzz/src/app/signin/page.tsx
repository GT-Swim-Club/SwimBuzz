import Link from "next/link"
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import SignInButton from "@/components/SignInButton"

export const metadata = {
  title: "Sign in — SwimBuzz",
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (session) redirect("/athletes")

  const { callbackUrl, error } = await searchParams
  const destination = callbackUrl?.startsWith("/") ? callbackUrl : "/athletes"

  return (
    <div className="relative -mx-4 -my-8 flex min-h-[calc(100vh-57px)] items-center justify-center px-4 py-12">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl dark:bg-indigo-400/10" />
        <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl dark:bg-cyan-400/10" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="rounded-2xl border border-gray-200 bg-white/90 p-8 shadow-xl backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/90">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-gray-900 dark:text-zinc-100"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm text-white">
              S
            </span>
            SwimBuzz
          </Link>

          <h1 className="mt-8 text-2xl font-semibold tracking-tight text-gray-900 dark:text-zinc-100">
            Sign in to your team
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-zinc-400">
            Use your Google account to access the Georgia Tech Swim Club roster,
            meets, and practice tools.
          </p>

          {error && (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              Sign in failed. Please try again or contact a coach if the problem
              continues.
            </p>
          )}

          <div className="mt-8">
            <SignInButton callbackUrl={destination} />
          </div>

          <p className="mt-6 text-center text-xs text-gray-500 dark:text-zinc-500">
            Access is currently limited to @gtswimclub.com accounts.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400 dark:text-zinc-600">
          <Link href="/" className="hover:text-gray-600 dark:hover:text-zinc-400">
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  )
}
