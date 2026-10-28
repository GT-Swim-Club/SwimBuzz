import { prisma } from "@/lib/prisma"
import {
  leadoffEventFromRelay,
  leadoffSwimTags,
  relaySplitEventFromRelay,
  relaySplitSwimTags,
  type RelayRound,
} from "@/lib/meet/relay-results"
import type { SwimCloudTime } from "@/lib/swim/swimcloud-import"
import { normalizeEventName } from "@/lib/swim/swim-parse"

/** One row of a swimmer's results at a SwimCloud meet (profile → Latest Results → meet dropdown). */
export type SwimCloudMeetRow = {
  /** SwimCloud's swim id, shared with the times_by_event API. */
  swimId: number
  /** Event number in the meet's results, from the row's results link. */
  eventNo: number | null
  /** "50 Y Free", or "200 Medley Relay (Fly)" for a relay leg. */
  event: string
  /** "Prelims", "Finals", "Timed Finals", "Swim-off". */
  round: string
  time: string
  place: number | null
}

export type SwimCloudMeetScrape = {
  meetId: number
  name: string
  /** "YYYY-MM-DD". */
  startDate: string
  endDate: string
  /** "SCY" | "LCM" | "SCM": the swimmer's individual events there, which relay rows don't show. */
  course: string
  rows: SwimCloudMeetRow[]
}

/** What the scraper sends per SwimCloud profile; `dates` holds exact days from times_by_event. */
export type SwimCloudProfileScrape = {
  meets: SwimCloudMeetScrape[]
  dates: Record<string, { date: string; tags?: string }>
}

const INDIVIDUAL_EVENT = /^(\d+)\s+([YLS])\s+(Free|Back|Breast|Fly|IM)$/i
const RELAY_LEG = /^(.*\bRelay)\s*\(([^)]+)\)$/i
const COURSE_BY_LETTER: Record<string, string> = { Y: "SCY", L: "LCM", S: "SCM" }

function roundLetter(round: string): "P" | "F" | "S" | "" {
  const r = round.trim().toLowerCase()
  if (r.includes("swim-off") || r.includes("swim off")) return "S"
  if (r.includes("timed")) return ""
  if (r.includes("prelim")) return "P"
  if (r.includes("final")) return "F"
  return ""
}

/** Relay leg from SwimCloud's label: 1 for a lead-off, null for a free-relay "Split" (leg 2 or 3). */
function relayLeg(label: string, medley: boolean): number | null | undefined {
  const l = label.trim().toLowerCase()
  if (l === "leadoff" || l === "lead-off" || (medley && l === "back")) return 1
  if (l === "anchor" || (medley && l === "free")) return 4
  if (medley && l === "breast") return 2
  if (medley && l === "fly") return 3
  if (l === "split") return null
  return undefined
}

/** SwimCloud flags (X extracted, U user inputted) plus the round, without a lead-off R the tags already say. */
function flatSwimTags(flags: string | undefined, round: string): string {
  const letters = [...(flags ?? "").toUpperCase()].filter((c) => /[A-Z]/.test(c) && c !== "R")
  return [...new Set([...letters, roundLetter(round)].filter(Boolean))].join("")
}

/**
 * A relay row's day when the scraper sent none (times_by_event doesn't give legs 2–4, and the
 * scraper only looks up the open ones at multi-day meets): the day of the dated swims around it in
 * event order when they agree, else the nearer one, else the meet's first day.
 */
function inferRelayDate(row: SwimCloudMeetRow, dated: { eventNo: number; date: string }[], fallback: string) {
  if (row.eventNo == null) return fallback
  let prev: { eventNo: number; date: string } | undefined
  let next: { eventNo: number; date: string } | undefined
  for (const swim of dated) {
    if (swim.eventNo < row.eventNo && (!prev || swim.eventNo > prev.eventNo)) prev = swim
    if (swim.eventNo > row.eventNo && (!next || swim.eventNo < next.eventNo)) next = swim
  }
  if (prev && next) {
    if (prev.date === next.date) return prev.date
    return row.eventNo - prev.eventNo <= next.eventNo - row.eventNo ? prev.date : next.date
  }
  return (prev ?? next)?.date ?? fallback
}

/** Swims from one profile's meets: individual swims, relay lead-offs (R|…) and legs 2–4 (SPLIT|…). */
export function swimCloudTimesFromMeets(profile: SwimCloudProfileScrape): SwimCloudTime[] {
  const times: SwimCloudTime[] = []
  for (const meet of profile.meets) {
    const exactDate = (row: SwimCloudMeetRow) => profile.dates[String(row.swimId)]?.date
    const dated = meet.rows.flatMap((row) => {
      const date = exactDate(row)
      return date && row.eventNo != null ? [{ eventNo: row.eventNo, date }] : []
    })

    for (const row of meet.rows) {
      const lookup = profile.dates[String(row.swimId)]
      const individual = row.event.trim().match(INDIVIDUAL_EVENT)
      if (individual) {
        times.push({
          event: normalizeEventName(`${individual[1]} ${individual[3]}`),
          course: COURSE_BY_LETTER[individual[2].toUpperCase()],
          time: row.time,
          date: lookup?.date ?? meet.startDate,
          meet: meet.name,
          tags: flatSwimTags(lookup?.tags, row.round),
          place: row.place,
        })
        continue
      }

      const relay = row.event.trim().match(RELAY_LEG)
      if (!relay) continue
      const relayEvent = normalizeEventName(relay[1])
      const leg = relayLeg(relay[2], /medley/i.test(relayEvent))
      if (leg === undefined) continue
      const round = roundLetter(row.round)
      const relayRound: RelayRound = round === "P" || round === "F" ? round : ""

      if (leg === 1) {
        const event = leadoffEventFromRelay(relayEvent)
        if (!event) continue
        times.push({
          event,
          course: meet.course,
          time: row.time,
          date: lookup?.date ?? meet.startDate,
          meet: meet.name,
          tags: leadoffSwimTags(relayEvent, relayRound),
        })
        continue
      }

      // A free relay's legs 2–4 are all the same event, so an unnumbered "Split" still has one.
      const event = relaySplitEventFromRelay(relayEvent, leg ?? 2)
      if (!event) continue
      times.push({
        event,
        course: meet.course,
        time: row.time,
        date: lookup?.date ?? inferRelayDate(row, dated, meet.startDate),
        meet: meet.name,
        tags: relaySplitSwimTags(relayEvent, leg, relayRound),
        meetDays: { start: meet.startDate, end: meet.endDate || meet.startDate },
      })
    }
  }
  return times
}

function isMeetRow(value: unknown): value is SwimCloudMeetRow {
  if (!value || typeof value !== "object") return false
  const { swimId, event, time } = value as Record<string, unknown>
  return Number.isInteger(swimId) && typeof event === "string" && typeof time === "string"
}

function isMeetScrape(value: unknown): value is SwimCloudMeetScrape {
  if (!value || typeof value !== "object") return false
  const { meetId, name, startDate, course, rows } = value as Record<string, unknown>
  return (
    Number.isInteger(meetId) &&
    typeof name === "string" &&
    typeof startDate === "string" &&
    typeof course === "string" &&
    Array.isArray(rows)
  )
}

/**
 * One scraped SwimCloud profile as swims plus the meets it read. Takes the meet-dropdown shape
 * ({ meets, dates }) or a plain array of times from scrapers that predate it.
 */
export function readSwimCloudProfile(raw: unknown): { times: unknown[]; meetIds: number[] } | null {
  if (Array.isArray(raw)) return { times: raw, meetIds: [] }
  if (!raw || typeof raw !== "object") return null
  const { meets, dates } = raw as Record<string, unknown>
  if (!Array.isArray(meets)) return null
  const valid = meets.filter(isMeetScrape).map((meet) => ({ ...meet, rows: meet.rows.filter(isMeetRow) }))
  const profile: SwimCloudProfileScrape = {
    meets: valid,
    dates: dates && typeof dates === "object" ? (dates as SwimCloudProfileScrape["dates"]) : {},
  }
  return { times: swimCloudTimesFromMeets(profile), meetIds: valid.map((meet) => meet.meetId) }
}

/** Remember the SwimCloud meets imported for an athlete, so the next sync skips them. */
export async function recordSwimCloudMeetSyncs(athleteId: string, meetIds: number[]) {
  if (meetIds.length === 0) return
  const athlete = await prisma.athlete.findUnique({
    where: { id: athleteId },
    select: { swimCloudSyncedMeetIds: true },
  })
  if (!athlete) return
  const merged = [...new Set([...athlete.swimCloudSyncedMeetIds, ...meetIds])]
  if (merged.length === athlete.swimCloudSyncedMeetIds.length) return
  await prisma.athlete.update({ where: { id: athleteId }, data: { swimCloudSyncedMeetIds: merged } })
}

/**
 * The `synced_meets` job payload: SwimCloud meets already imported, keyed by SwimCloud id, for
 * the scraper to skip (it still re-reads a profile's newest and recent meets). An athlete's
 * profiles share the athlete's list.
 */
export async function syncedSwimCloudMeets(athleteIds: string[]): Promise<Record<string, number[]>> {
  const athletes = await prisma.athlete.findMany({
    where: { id: { in: athleteIds } },
    select: { swimCloudIds: true, swimCloudSyncedMeetIds: true },
  })
  const synced: Record<string, number[]> = {}
  for (const athlete of athletes) {
    if (athlete.swimCloudSyncedMeetIds.length === 0) continue
    for (const id of athlete.swimCloudIds) synced[String(id)] = athlete.swimCloudSyncedMeetIds
  }
  return synced
}
