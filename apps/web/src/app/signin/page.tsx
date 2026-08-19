import Link from "next/link"
import Image from "next/image"
import { redirect } from "next/navigation"
import SignInMethods from "@/components/SignInMethods"
import { getSession } from "@/lib/session"
import {
  STAFF_ONLY_SIGNIN_ERROR,
  STAFF_LINK_REQUIRED_ERROR,
} from "@swimbuzz/shared"

export const metadata = {
  title: "Sign in — SwimBuzz"}

export default async function SignInPage({
  searchParams}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>
}) {
  const session = await getSession()
  if (session) redirect("/athletes")

  const { callbackUrl, error } = await searchParams
  const destination = callbackUrl?.startsWith("/") ? callbackUrl : "/athletes"

  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-primary-hover/10 blur-3xl" />
      </div>

      <div className="fixed inset-0 z-30 flex items-center justify-center px-4 py-12">
        <div className="relative w-full max-w-lg">
          <p className="absolute bottom-full left-0 right-0 mb-4 text-center text-xs text-foreground-quaternary">
            <Link href="/" className="hover:text-foreground">
              ← Back to home
            </Link>
          </p>

          <div className="rounded-2xl border border-border bg-background/90 p-8 shadow-xl backdrop-blur-sm">
            <Link
              href="/"
              className="flex w-full items-center justify-center gap-2.5 text-[15px] font-semibold tracking-tight text-primary-active dark:text-primary-hover"
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

            <div className="mt-5 text-center">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Sign in
              </h1>
              <p className="mt-2 text-[15px] leading-relaxed text-foreground-secondary">
                to access GTSC roster, meets, and practice tools
              </p>
            </div>

            {error && (
              <p className="mt-4 rounded-lg border border-error/20 bg-error/10 px-3 py-2 text-[15px] text-error-text">
                {error === "StaffOnly"
                  ? STAFF_ONLY_SIGNIN_ERROR
                  : error === "StaffLinkRequired"
                    ? STAFF_LINK_REQUIRED_ERROR
                    : "Sign in failed. Please try again or contact a coach if the problem continues."}
              </p>
            )}

            <SignInMethods callbackUrl={destination} />
          </div>
        </div>
      </div>
    </>
  )
}
