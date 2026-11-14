import { redirect } from "next/navigation"
import BackLink from "@/components/ui/BackLink"
import PinSearchParams from "@/components/ui/PinSearchParams"
import { getSession } from "@/lib/auth/session"
import { isStaffUi } from "@/lib/athlete/athlete-view-server"
import { listSeasonClearance } from "@/lib/athlete/athlete-clearance"
import { parseSeason, resolveListedSeason } from "@/lib/season"
import { listSeasons } from "@/lib/season-store"
import ClearanceView from "./ClearanceView"

export const dynamic = "force-dynamic"

/** Staff: who has a physical on file and a concussion baseline test for the season. */
export default async function ClearancePage(props: { searchParams: Promise<{ season?: string }> }) {
  const { season: seasonParam } = await props.searchParams
  const session = await getSession()
  if (!session) redirect(`/signin?callbackUrl=/athletes/clearance`)
  // Staff-only data: athletes (and staff in Athlete View) go back to the roster.
  if (!(await isStaffUi(session.user.role))) redirect("/athletes")

  const seasons = await listSeasons()
  const season = resolveListedSeason(parseSeason(seasonParam), seasons)
  const data = await listSeasonClearance(season)

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PinSearchParams params={{ season }} />
      <BackLink
        fallbackHref={`/athletes?season=${encodeURIComponent(season)}`}
        fallbackLabel="Roster"
        className="inline-flex items-center gap-2 text-sm font-medium text-foreground-tertiary transition-colors hover:text-foreground"
      />
      <ClearanceView season={season} seasons={seasons} athletes={data.athletes} />
    </main>
  )
}
