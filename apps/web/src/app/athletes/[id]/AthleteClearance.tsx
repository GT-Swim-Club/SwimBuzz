import { currentSeason } from "@/lib/season"
import { listSeasonClearance } from "@/lib/athlete/athlete-clearance"
import AthleteClearanceStrip from "./AthleteClearanceStrip"

/**
 * Physical & concussion clearance on the athlete page, for the running season (else
 * their newest). Render only for staff or the athlete themself — the caller checks.
 */
export default async function AthleteClearance({
  athleteId,
  seasons,
  canEdit,
}: {
  athleteId: string
  seasons: string[]
  canEdit: boolean
}) {
  const running = currentSeason()
  const season = seasons.includes(running) ? running : [...seasons].sort((a, b) => b.localeCompare(a))[0]
  if (!season) return null
  const status = (await listSeasonClearance(season, athleteId)).athletes[0]
  if (!status) return null
  return <AthleteClearanceStrip status={status} canEdit={canEdit} />
}
