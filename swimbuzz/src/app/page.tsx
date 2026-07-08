import Link from "next/link"
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"

type FeatureItem = {
  title: string
  description: string
}

const athleteFeatures: FeatureItem[] = [
  {
    title: "Browse the roster",
    description: "See who's on the team this season and open any swimmer's profile.",
  },
  {
    title: "Track personal bests",
    description: "View PB grids and full meet history for yourself and teammates.",
  },
  {
    title: "Follow meets",
    description:
      "Check meet dates, heat sheets, entries, travel info, and live stream links in one place.",
  },
  {
    title: "Read practice plans",
    description: "Access published workouts with sets, intervals, and coach notes.",
  },
]

const coachFeatures: FeatureItem[] = [
  {
    title: "Manage the roster",
    description: "Import from SwimCloud or CSV, add athletes, sync times, and set nicknames.",
  },
  {
    title: "Run meets end to end",
    description:
      "Create meets, upload packets and heat sheets, import SwimPhone results, and edit entries.",
  },
  {
    title: "Write practices",
    description: "Build practice plans with tagged sets, then publish them for the team.",
  },
  {
    title: "Plan relays",
    description: "Assign relay legs, import results, and track leadoff splits across the season.",
  },
]

function FeatureList({ items }: { items: FeatureItem[] }) {
  return (
    <ul className="mt-6 space-y-4">
      {items.map((item) => (
        <li key={item.title} className="flex gap-3">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500 dark:bg-indigo-400" />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-zinc-100">{item.title}</p>
            <p className="mt-0.5 text-sm leading-relaxed text-gray-600 dark:text-zinc-400">
              {item.description}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}

export default async function HomePage() {
  const session = await getServerSession(authOptions)
  if (session) redirect("/athletes")

  return (
    <div className="-mx-4 -my-8">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-gray-200/80 dark:border-zinc-800">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-20 top-0 h-96 w-96 rounded-full bg-indigo-500/15 blur-3xl dark:bg-indigo-400/10" />
          <div className="absolute right-0 top-20 h-80 w-80 rounded-full bg-cyan-400/15 blur-3xl dark:bg-cyan-500/10" />
          <div
            className="absolute inset-x-0 bottom-0 h-32 opacity-[0.07] dark:opacity-[0.12]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, currentColor 0, currentColor 1px, transparent 1px, transparent 48px)",
            }}
          />
        </div>

        <div className="relative mx-auto max-w-5xl px-6 py-20 sm:py-28">
          <p className="text-sm font-medium uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
            Georgia Tech Swim Club
          </p>
          <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl dark:text-zinc-50">
            Everything your team needs between the blocks.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-gray-600 dark:text-zinc-400">
            SwimBuzz is the club&apos;s home for rosters, meet prep, practice plans,
            and relay management — built for coaches and swimmers at GTSC.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href="/signin"
              className="inline-flex items-center rounded-xl bg-indigo-600 px-6 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
            >
              Sign in with Google
            </Link>
            <Link
              href="/signin?callbackUrl=/athletes"
              className="inline-flex items-center rounded-xl border border-gray-300 px-6 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Go to roster
            </Link>
          </div>
        </div>
      </section>

      {/* Role-based features */}
      <section className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-zinc-100">
            Built for swimmers and coaches
          </h2>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5" aria-hidden="true">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-zinc-100">Athletes</h3>
                <p className="text-sm text-gray-500 dark:text-zinc-400">View and follow the season</p>
              </div>
            </div>
            <FeatureList items={athleteFeatures} />
          </div>

          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-6 sm:p-8 dark:border-indigo-900/60 dark:bg-indigo-950/20">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5" aria-hidden="true">
                  <path d="M12 14l9-5-9-5-9 5 9 5z" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M12 14l6.16-3.422A12.083 12.083 0 0 1 21 13.5c0 2.485-4.03 4.5-9 4.5s-9-2.015-9-4.5c0-.943.38-1.823 1.04-2.615L12 14z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-zinc-100">Coaches</h3>
                <p className="text-sm text-gray-500 dark:text-zinc-400">Manage and import team data</p>
              </div>
            </div>
            <FeatureList items={coachFeatures} />
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="border-t border-gray-200 bg-gray-50 px-6 py-14 dark:border-zinc-800 dark:bg-zinc-950/50">
        <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-medium text-gray-900 dark:text-zinc-100">
              Ready to dive in?
            </h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-zinc-400">
              Sign in with your Google account to get started.
            </p>
          </div>
          <Link
            href="/signin"
            className="inline-flex shrink-0 items-center rounded-xl bg-indigo-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
          >
            Sign in
          </Link>
        </div>
      </section>
    </div>
  )
}
