import { prisma } from "@/lib/prisma"
import { collectMeetRosterAthleteIds } from "@/lib/meet/meet-sheet-summary"
import { isMeetFinalRoster } from "@/lib/meet/meet-roster-import"
import { isSignupRelayPreferences } from "@/lib/meet/meet-signup-import"

/**
 * Athletes "on" a meet, for meet notifications. Once the final meet roster is imported it decides
 * (plus anyone with results, who swam regardless); before that it is everyone on the meet's
 * sheets, published relays or results, and everyone who signed up. Only athletes still on the
 * meet's season roster count.
 */
export async function meetAudienceAthleteIds(meetId: string): Promise<string[]> {
  const meet = await prisma.meet.findUnique({
    where: { id: meetId },
    select: {
      season: true,
      psychSheetSummary: true,
      heatSheetSummary: true,
      finalsHeatSheetSummary: true,
      entriesSheetSummary: true,
      relayResultsSummary: true,
      resultStatusesSummary: true,
      finalRoster: true,
      signupRelayPreferences: true,
      swims: { select: { athleteId: true }, distinct: ["athleteId"] },
    },
  })
  if (!meet) return []

  const swimmers = meet.swims.map((s) => s.athleteId)
  const ids = new Set<string>()

  if (isMeetFinalRoster(meet.finalRoster)) {
    for (const id of meet.finalRoster.athleteIds) ids.add(id)
    for (const id of swimmers) ids.add(id)
    for (const id of collectMeetRosterAthleteIds({ resultStatusesSummary: meet.resultStatusesSummary })) ids.add(id)
  } else {
    for (const id of collectMeetRosterAthleteIds({
      psychSheetSummary: meet.psychSheetSummary,
      heatSheetSummary: meet.heatSheetSummary,
      finalsHeatSheetSummary: meet.finalsHeatSheetSummary,
      entriesSheetSummary: meet.entriesSheetSummary,
      relayResultsSummary: meet.relayResultsSummary,
      resultStatusesSummary: meet.resultStatusesSummary,
      swimAthleteIds: swimmers,
    })) {
      ids.add(id)
    }
    if (isSignupRelayPreferences(meet.signupRelayPreferences)) {
      for (const a of meet.signupRelayPreferences.athletes) ids.add(a.athleteId)
    }
    const signups = await prisma.meetSignupEntry.findMany({
      where: { form: { meetId } },
      select: { athleteId: true },
    })
    for (const s of signups) ids.add(s.athleteId)
  }
  if (ids.size === 0) return []

  const onSeason = await prisma.athlete.findMany({
    where: { id: { in: [...ids] }, seasons: { has: meet.season } },
    select: { id: true },
  })
  return onSeason.map((a) => a.id)
}
