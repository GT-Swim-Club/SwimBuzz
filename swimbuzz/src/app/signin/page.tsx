import Link from "next/link"
import Image from "next/image"
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import SignInButton from "@/components/SignInButton"
import EmailSignInForm from "@/components/EmailSignInForm"

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
    <div className="relative -mx-4 -my-8 flex min-h-[calc(100vh-65px)] items-center justify-center px-4 py-12">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl dark:bg-indigo-400/10" />
        <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl dark:bg-cyan-400/10" />
      </div>

      <div className="relative w-full max-w-lg">
        <div className="rounded-2xl border border-border bg-background/90 p-8 shadow-xl backdrop-blur-sm">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 text-sm font-semibold tracking-tight text-foreground"
          >
            <Image
              src="/swimbuzz-logo.png"
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 rounded-lg"
              priority
            />
            SwimBuzz
          </Link>

          <h1 className="mt-8 text-2xl font-semibold tracking-tight text-foreground">
            Sign in to your team
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-foreground-secondary">
            Access the Georgia Tech Swim Club roster, meets, and practice tools.
          </p>

          {error && (
            <p className="mt-4 rounded-lg border border-error/20 bg-error/10 px-3 py-2 text-sm text-error-text">
              Sign in failed. Please try again or contact a coach if the problem
              continues.
            </p>
          )}

          <div className="relative mt-4 mb-4">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-background px-3 text-foreground-tertiary">
                Athletes
              </span>
            </div>
          </div>

          <EmailSignInForm callbackUrl={destination} />

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-background px-3 text-foreground-tertiary">
                Coaches & Exec
              </span>
            </div>
          </div>

          <SignInButton callbackUrl={destination} />
        </div>

        <p className="mt-6 text-center text-xs text-foreground-quaternary">
          <Link href="/" className="hover:text-foreground">
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  )
}
