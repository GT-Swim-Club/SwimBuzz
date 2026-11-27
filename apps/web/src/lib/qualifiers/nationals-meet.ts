import type { Gender } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { resolveSignupEventOptions } from "@/lib/meet/meet-signup"
import { isEventOrder } from "@/lib/meet/meet-event-order"
import { eventOrderWithHeats, type EventOrderWithHeats } from "@/lib/meet/event-heats"
import { coerceMeetPlaceTimes, placeTimesLookup, type PlaceTimes } from "@/lib/meet/place-times"
import { formatSeasonLabel } from "@swimbuzz/shared"
import { canonicalizeStrokeEvent } from "@/lib/swim/swim-parse"

export type NationalsMeetRef = { id: string; name: string; slug: string | null }

/** Key for an individual event's number: "F|50 back". */
function eventNumberKey(gender: Gender, event: string) {
  return `${gender}|${canonicalizeStrokeEvent(event).toLowerCase()}`
}

/**
 * The season's Nationals meet (picked by a coach on the Nationals page) and its individual events'
 * numbers from the meet's order of events, by gender. No link, a deleted meet, or a meet without
 * an order of events gives no numbers.
 */
export async function loadNationalsMeet(season: string): Promise<{
  meet: NationalsMeetRef | null
  eventNumber: (gender: Gender, event: string) => number | null
}> {
  const row = await prisma.nationalsMeet.findUnique({
    where: { season },
    select: { meet: { select: { id: true, name: true, slug: true, eventOrder: true, deletedAt: true } } },
  })
  // A meet in Recently Deleted keeps its link (restoring it brings the numbers back) but shows none.
  const link = row && !row.meet.deletedAt ? row : null
  const numbers = new Map<string, number>()
  for (const option of resolveSignupEventOptions(link?.meet.eventOrder)) {
    if (option.isRelay) continue
    for (const [gender, number] of [["F", option.women], ["M", option.men]] as const) {
      const key = eventNumberKey(gender, option.event)
      if (number != null && number > 0 && !numbers.has(key)) numbers.set(key, number)
    }
  }
  return {
    meet: link ? { id: link.meet.id, name: link.meet.name, slug: link.meet.slug } : null,
    eventNumber: (gender, event) => numbers.get(eventNumberKey(gender, event)) ?? null,
  }
}

export type NationalsEventOrder = {
  /** Every session and event (relays too), with each event's heat count from the heat sheets. */
  order: EventOrderWithHeats
  /** Last season's Nationals champion, 8th and 24th place times, or null without any. */
  placeTimes: ((gender: "F" | "M", event: string) => PlaceTimes | null) | null
  /** Where those times are from: "Last year's champion, 8th and 24th place times · CCS Nationals 2025–2026 …". */
  placeTimesCaption: string | null
}

/** "2026-2027" → "2025-2026". */
function previousSeason(season: string): string {
  const start = Number(season.split("-")[0])
  return `${start - 1}-${start}`
}

/**
 * The season's Nationals meet's order of events, with last season's Nationals place times (from
 * its results PDF) to show beside it. Null with no linked meet, a deleted one, or a meet without
 * an order of events.
 */
export async function loadNationalsEventOrder(season: string): Promise<NationalsEventOrder | null> {
  const [row, last] = await Promise.all([
    prisma.nationalsMeet.findUnique({
      where: { season },
      select: {
        meet: { select: { eventOrder: true, heatSheetSummary: true, finalsHeatSheetSummary: true, deletedAt: true } },
      },
    }),
    prisma.nationalsMeet.findUnique({
      where: { season: previousSeason(season) },
      select: { meet: { select: { name: true, season: true, placeTimes: true, deletedAt: true } } },
    }),
  ])
  if (!row || row.meet.deletedAt || !isEventOrder(row.meet.eventOrder)) return null
  const placeTimes = last && !last.meet.deletedAt ? coerceMeetPlaceTimes(last.meet.placeTimes) : null
  return {
    order: eventOrderWithHeats(row.meet.eventOrder, row.meet),
    placeTimes: placeTimes ? placeTimesLookup(placeTimes) : null,
    placeTimesCaption:
      placeTimes && last
        ? `Last year's champion, 8th and 24th place times · ${last.meet.name} ${formatSeasonLabel(last.meet.season)} · 8th and 24th from prelims`
        : null,
  }
}

/**
 * Links `meetId` as the season's Nationals meet, or clears the link (null). The soft-delete policy
 * refuses linking a deleted meet.
 */
export async function setNationalsMeet(season: string, meetId: string | null) {
  if (!meetId) {
    await prisma.nationalsMeet.deleteMany({ where: { season } })
    return
  }
  await prisma.nationalsMeet.upsert({
    where: { season },
    create: { season, meetId },
    update: { meetId },
  })
}

/** The season's meets a coach can pick as its Nationals, in date order. */
export function listNationalsMeetOptions(season: string) {
  return prisma.meet.findMany({
    where: { season },
    select: { id: true, name: true },
    orderBy: { startsAt: "asc" },
  })
}
