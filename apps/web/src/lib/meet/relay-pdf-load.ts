import { meetHeaderDetails } from "@swimbuzz/shared"
import { prisma } from "@/lib/prisma"
import { resolveSignupEventOptions } from "@/lib/meet/meet-signup"
import { loadMeetIconPng } from "@/lib/meet/meet-icon-png"
import { buildRelayLineups } from "@/lib/meet/relay-lineups"
import { relayEventSlots, relayShareEvent, slotMatches } from "@/lib/meet/relay-builder"
import type { RelaysPdfInput } from "@/lib/meet/relay-pdf"

/**
 * Published relays of a meet (by id or slug) for the PDF export — the same events, numbers and
 * order as the relays page's Share menu. Null when the meet doesn't exist.
 */
export async function loadRelaysPdfInput(idOrSlug: string): Promise<RelaysPdfInput | null> {
  const meet = await prisma.meet.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    select: {
      name: true,
      location: true,
      school: true,
      startsAt: true,
      endsAt: true,
      timeZone: true,
      iconUrl: true,
      season: true,
      eventOrder: true,
      relayResultsSummary: true,
      psychSheetSummary: true,
      heatSheetSummary: true,
      finalsHeatSheetSummary: true,
      entriesSheetSummary: true,
    },
  })
  if (!meet) return null

  const [seasonAthletes, iconPng] = await Promise.all([
    prisma.athlete.findMany({
      where: { seasons: { has: meet.season } },
      select: { id: true, slug: true, firstName: true, lastName: true, preferredName: true, gender: true },
    }),
    loadMeetIconPng(meet.iconUrl),
  ])
  const relayLineups = buildRelayLineups(meet, seasonAthletes)
  const eventOrder = resolveSignupEventOptions(meet.eventOrder).filter((option) => option.isRelay)
  const events = relayEventSlots(eventOrder, relayLineups).flatMap((slot) => {
    const published = relayLineups.filter((relay) => slotMatches(slot, relay.gender, relay.event))
    return published.length > 0 ? [relayShareEvent(slot, published)] : []
  })
  return { meetName: meet.name, details: meetHeaderDetails(meet), iconPng, events }
}
