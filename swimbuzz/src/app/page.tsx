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
    title: "See Nationals qualifiers",
    description: "Check who has made qualifying standards from this season’s meet results.",
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
    description:
      "Build optimal lineups on each meet from PBs, filter by signup interest, and track leadoff splits.",
  },
  {
    title: "Track Nationals cuts",
    description:
      "Upload qualifying-time PDFs and see who has made Nationals standards from this season’s meets.",
  },
]

function FeatureList({ items }: { items: FeatureItem[] }) {
  return (
    <ul className="mt-6 space-y-4">
      {items.map((item) => (
        <li key={item.title} className="flex gap-3">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">{item.title}</p>
            <p className="mt-0.5 text-sm leading-relaxed text-foreground-secondary">
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
      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-20 top-0 h-96 w-96 rounded-full bg-primary/15 blur-3xl" />
          <div className="absolute right-0 top-20 h-80 w-80 rounded-full bg-cyan-500/15 blur-3xl" />
          <div className="absolute inset-x-0 bottom-0 h-32 opacity-[0.07]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, currentColor 0, currentColor 1px, transparent 1px, transparent 48px)",
            }}
          />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:py-28">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">
            Georgia Tech Swim Club
          </p>
          <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Everything your team needs between the blocks.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-foreground-secondary">
            SwimBuzz is the club&apos;s home for rosters, meet prep, practice plans,
            and relay management — built for coaches and swimmers at GTSC.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href="/signin"
              className="inline-flex items-center rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-text shadow-sm transition-colors hover:bg-primary-hover"
            >
              Get Started
            </Link>
            <Link
              href="/signin?callbackUrl=/athletes"
              className="inline-flex items-center rounded-xl border border-border px-6 py-3 text-sm font-medium text-foreground-secondary transition-colors hover:bg-fill-secondary"
            >
              Go to roster
            </Link>
          </div>
        </div>
      </section>

      {/* Role-based features */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:py-20">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Built for swimmers and coaches
          </h2>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-background p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5" aria-hidden="true">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-medium text-foreground">Athletes</h3>
                <p className="text-sm text-foreground-tertiary">View and follow the season</p>
              </div>
            </div>
            <FeatureList items={athleteFeatures} />
          </div>

          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5" aria-hidden="true">
                  <path d="M12 14l9-5-9-5-9 5 9 5z" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M12 14l6.16-3.422A12.083 12.083 0 0 1 21 13.5c0 2.485-4.03 4.5-9 4.5s-9-2.015-9-4.5c0-.943.38-1.823 1.04-2.615L12 14z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-medium text-foreground">Coaches</h3>
                <p className="text-sm text-foreground-tertiary">Manage and import team data</p>
              </div>
            </div>
            <FeatureList items={coachFeatures} />
          </div>
        </div>
      </section>
    </div>
  )
}
