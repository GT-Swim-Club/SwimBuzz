import Link from "next/link"
import { redirect } from "next/navigation"
import { getSession } from "@/lib/session"
type FeatureItem = {
  title: string
  description: string
}

const athleteFeatures: FeatureItem[] = [
  {
    title: "Browse the roster",
    description: "See who's swimming this season and get to a teammate's profile quickly."},
  {
    title: "Track personal bests",
    description: "Look up your best times, meet results, and teammates' swims."},
  {
    title: "Follow meets",
    description:
      "Find dates, entries, heat sheets, travel info, and livestreams."},
  {
    title: "See Nationals qualifiers",
    description: "See who has qualified this season."},
  {
    title: "Read practice plans",
    description: "Read the workout, intervals, and notes before you get to the pool."},
]

const coachFeatures: FeatureItem[] = [
  {
    title: "Keep the roster up to date",
    description: "Import a roster, update profiles, and pull in new times when you need to."},
  {
    title: "Set up meets",
    description:
      "Add meet info, share the files swimmers need, and manage entries."},
  {
    title: "Write practices",
    description: "Write the plan once and publish it for the team."},
  {
    title: "Plan relays",
    description:
      "Try lineups using personal bests and signup interest."},
  {
    title: "Nationals tracking",
    description:
      "Upload the standards and see who has made the cut."},
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
  const session = await getSession()
  if (session) redirect("/athletes")

  return (
    <div className="relative left-1/2 w-screen -translate-x-1/2 -my-6 sm:-my-8">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border bg-background">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(110% 135% at 4% -25%, color-mix(in srgb, var(--brand-color-primary) 18%, transparent) 0%, color-mix(in srgb, var(--brand-color-primary) 10%, transparent) 36%, transparent 74%), radial-gradient(62% 100% at 100% 18%, color-mix(in srgb, var(--brand-color-primary) 8%, transparent) 0%, transparent 82%)",
            maskImage: "linear-gradient(to bottom, black 0%, black 58%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 58%, transparent 100%)",
          }}
        >
          <div
            className="absolute inset-x-0 bottom-0 h-24 opacity-[0.04]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, currentColor 0, currentColor 1px, transparent 1px, transparent 48px)",
            }}
          />
        </div>

        <div className="relative mx-auto max-w-[84rem] px-4 py-12 min-[375px]:px-6 sm:px-10 sm:py-20 lg:px-12 lg:py-24 xl:max-w-none xl:px-[clamp(8rem,10vw,18rem)]">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">
            Georgia Tech Swim Club
          </p>
          <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Keep the team up to date.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-foreground-secondary sm:text-lg">
            Meet info, practice plans, and roster updates—without chasing messages or spreadsheets.
          </p>
          <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <Link
              href="/signin"
              className="inline-flex w-full items-center justify-center rounded-xl bg-primary px-6 py-3 sm:w-auto text-sm font-medium text-primary-text shadow-sm transition-colors hover:bg-primary-hover"
            >
              Sign in
            </Link>
            <Link
              href="/signin?callbackUrl=/meets"
              className="inline-flex w-full items-center justify-center rounded-xl border border-border px-6 py-3 sm:w-auto text-sm font-medium text-foreground-secondary transition-colors hover:bg-fill-secondary"
            >
              Go to meets
            </Link>
          </div>
        </div>
      </section>

      {/* Role-based features */}
      <section className="mx-auto max-w-[84rem] px-4 py-8 min-[375px]:px-6 sm:px-10 sm:py-2 lg:px-12 xl:max-w-none xl:px-[clamp(8rem,10vw,18rem)]">
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-7">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5" aria-hidden="true">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-medium text-foreground">Athletes</h3>
                <p className="text-sm text-foreground-tertiary">Your schedule, times, and meet details</p>
              </div>
            </div>
            <FeatureList items={athleteFeatures} />
          </div>

          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 shadow-sm sm:p-7">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5" aria-hidden="true">
                  <path d="M12 14l9-5-9-5-9 5 9 5z" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M12 14l6.16-3.422A12.083 12.083 0 0 1 21 13.5c0 2.485-4.03 4.5-9 4.5s-9-2.015-9-4.5c0-.943.38-1.823 1.04-2.615L12 14z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-medium text-foreground">Coaches</h3>
                <p className="text-sm text-foreground-tertiary">Rosters, practices, and meet info</p>
              </div>
            </div>
            <FeatureList items={coachFeatures} />
          </div>
        </div>
      </section>
    </div>
  )
}
