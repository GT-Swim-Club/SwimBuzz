"use server"

import { revalidatePath } from "next/cache"
import { Prisma, type Course } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { normalizeSwimForInsert, nextSwimOccurrence } from "@/lib/swim/swim-dedup"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@swimbuzz/shared"
import { isRelayLeadoffSwimTag, isRelaySplitSwimTag } from "@/lib/meet/relay-results"
import { syncTeamRecordsSafely } from "@/lib/records/record-sync"
import { formatTime, parseTime } from "@/lib/utils"
import {
  entryResultKey,
  isPrelimTag,
  isResultStatusesSummary,
  isSwimOffTag,
  resultKey,
  type MeetResultEntry,
  type ResultSplit,
} from "@/lib/meet/meet-sheet-summary"

export type AddMeetSwimInput = {
  athleteId: string
  event: string
  course: string
  date: string
  meet: string
  meetId: string
  timeMs: number
  /** Prelims ("P") or finals ("F"); "" or absent for a timed final. */
  round?: "P" | "F" | ""
  /** The 50 splits in order, as lap times or cumulative marks ("" where missing). */
  splits?: string[]
  /** The swim's place in its event (round), if known. */
  place?: number
}

/** Lap times for each 50 from what was typed: cumulative marks (rising to the final time) become laps. */
function manualSwimSplits(raw: string[] | undefined, timeMs: number): ResultSplit[] {
  const marks = (raw ?? []).map((t) => {
    const ms = t.trim() ? Math.round(parseTime(t)) : NaN
    return Number.isFinite(ms) && ms > 0 ? ms : null
  })
  if (marks.every((ms) => ms == null)) return []
  const complete = marks.every((ms) => ms != null)
  const values = marks as number[]
  const rising = complete && values.every((ms, i) => i === 0 || ms > values[i - 1])
  const lapsSum = complete ? values.reduce((sum, ms) => sum + ms, 0) : 0
  const cumulative =
    rising &&
    values.length > 1 &&
    Math.abs(values[values.length - 1] - timeMs) <= 200 &&
    Math.abs(lapsSum - timeMs) > 200
  return marks.flatMap((ms, i) => {
    if (ms == null) return []
    const lap = cumulative && i > 0 ? ms - values[i - 1] : ms
    return [{ distance: (i + 1) * 50, splitTime: formatTime(lap) }]
  })
}

/** Saves a manual swim's splits on the meet's result details, replacing that round's splits. */
async function saveManualSwimSplits(
  meetId: string,
  athleteId: string,
  event: string,
  round: "P" | "F" | "",
  splits: ResultSplit[]
) {
  const [meet, athlete] = await Promise.all([
    prisma.meet.findUnique({ where: { id: meetId }, select: { resultStatusesSummary: true } }),
    prisma.athlete.findUnique({ where: { id: athleteId }, select: { firstName: true, lastName: true } }),
  ])
  if (!meet || !athlete) return
  const entries = isResultStatusesSummary(meet.resultStatusesSummary) ? meet.resultStatusesSummary.entries : []
  const key = resultKey(athleteId, event, false)
  const field = round === "P" ? "prelimSplits" : round === "F" ? "finalSplits" : "splits"
  const index = entries.findIndex(
    (e) => !e.isRelayLeadoff && !e.isSwimOff && resultKey(e.athleteId, e.event, false) === key
  )
  const next: MeetResultEntry[] =
    index >= 0
      ? entries.map((e, i) => (i === index ? { ...e, [field]: splits } : e))
      : [...entries, { athleteId, athleteName: `${athlete.lastName}, ${athlete.firstName}`, event, [field]: splits }]
  await prisma.meet.update({
    where: { id: meetId },
    data: { resultStatusesSummary: { entries: next } as unknown as Prisma.InputJsonValue },
  })
}

/** Same logic as POST /api/swims (used by both web and mobile) — kept in
 * sync manually since the route can't be refactored without risking the
 * mobile-facing contract. */
export async function addMeetSwim(input: AddMeetSwimInput) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    throw new Error("Forbidden")
  }

  const { athleteId, event, timeMs, course, date } = input
  if (!athleteId || !event || !Number.isFinite(timeMs) || !course || !date) {
    throw new Error("Missing required swim fields")
  }

  const base = normalizeSwimForInsert({
    athleteId,
    event,
    timeMs,
    course: course as Course,
    date,
    source: "manual",
    meet: input.meet,
    meetId: input.meetId,
    tags: input.round === "P" || input.round === "F" ? input.round : ""})
  const splits = input.meetId ? manualSwimSplits(input.splits, base.timeMs) : []

  let occurrence = await nextSwimOccurrence(prisma, base)

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const place =
        input.place != null && Number.isInteger(input.place) && input.place > 0 ? input.place : null
      const created = await prisma.swim.create({ data: { ...base, occurrence, place } })
      if (created.meetId) await clearRemovedTimeMark(created.meetId, athleteId, base.event, base.tags)
      if (created.meetId && splits.length > 0) {
        await saveManualSwimSplits(created.meetId, athleteId, base.event, input.round ?? "", splits)
      }
      if (created.meetId) await syncTeamRecordsSafely()
      revalidatePath("/meets/[id]", "page")
      return created
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        occurrence++
        continue
      }
      throw err
    }
  }

  throw new Error("Could not save swim — too many matching duplicates")
}

export type EditMeetSwimInput = {
  athleteId: string
  event: string
  course: string
  date: string
  meet: string
  meetId: string
  timeMs: number
}

/** Same logic as PATCH /api/swims/[id] (used by both web and mobile) — kept
 * in sync manually since the route can't be refactored without risking the
 * mobile-facing contract. */
export async function editMeetSwim(swimId: string, input: EditMeetSwimInput) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    throw new Error("Forbidden")
  }

  const swim = await prisma.swim.findUnique({ where: { id: swimId } })
  if (!swim) throw new Error("Not found")
  if (swim.source !== "manual") {
    throw new Error("Only manually logged swims can be edited")
  }
  if (isRelayLeadoffSwimTag(swim.tags)) {
    throw new Error("Relay leadoff swims can only be edited through the relay")
  }

  const { athleteId, event, timeMs, course, date } = input
  if (!athleteId || !event || !Number.isFinite(timeMs) || !course || !date) {
    throw new Error("Missing required swim fields")
  }

  const base = normalizeSwimForInsert({
    athleteId,
    event,
    timeMs,
    course: course as Course,
    date,
    source: "manual",
    meet: input.meet,
    meetId: input.meetId,
    tags: swim.tags})

  let occurrence = await nextSwimOccurrence(prisma, base)

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const updated = await prisma.swim.update({
        where: { id: swimId },
        data: { ...base, occurrence }})
      if (updated.meetId || swim.meetId) await syncTeamRecordsSafely()
      revalidatePath("/meets/[id]", "page")
      return updated
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        occurrence++
        continue
      }
      throw err
    }
  }

  throw new Error("Could not save swim — too many matching duplicates")
}

/** Same logic as DELETE /api/swims/[id]. */
export async function deleteMeetSwim(swimId: string) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    throw new Error("Forbidden")
  }

  const swim = await prisma.swim.findUnique({ where: { id: swimId } })
  if (!swim) throw new Error("Not found")
  if (swim.source !== "manual") {
    throw new Error("Only manually logged swims can be deleted")
  }
  if (isRelayLeadoffSwimTag(swim.tags)) {
    throw new Error("Relay leadoff swims can only be edited through the relay")
  }

  await prisma.swim.delete({ where: { id: swimId } })
  if (swim.meetId) await syncTeamRecordsSafely()
  revalidatePath("/meets/[id]", "page")
  return { ok: true }
}

/** The result-details fields of one round of a swim: prelims, finals, or the only (or swim-off) swim. */
function roundResultFields(tags: string) {
  const t = tags.trim().toUpperCase()
  if (isPrelimTag(t)) {
    return { time: "prelimTime", status: "prelimStatus", place: "prelimPlace", points: "prelimPoints", splits: "prelimSplits" } as const
  }
  if (!isSwimOffTag(t) && (t === "F" || t.includes("FINAL"))) {
    return { time: "finalTime", status: "finalStatus", place: "finalPlace", points: "finalPoints", splits: "finalSplits" } as const
  }
  return { time: "resultTime", status: "resultStatus", place: "resultPlace", points: "resultPoints", splits: "splits" } as const
}

/** A swim logged into a round whose time was removed replaces that round's "NT" mark. */
async function clearRemovedTimeMark(meetId: string, athleteId: string, event: string, tags: string) {
  const meet = await prisma.meet.findUnique({ where: { id: meetId }, select: { resultStatusesSummary: true } })
  if (!meet || !isResultStatusesSummary(meet.resultStatusesSummary)) return
  const swimOff = isSwimOffTag(tags)
  const key = swimOff
    ? entryResultKey({ athleteId, event, isSwimOff: true })
    : resultKey(athleteId, event, false)
  const { status } = roundResultFields(tags)
  const entries = meet.resultStatusesSummary.entries
  const index = entries.findIndex((e) => !e.isRelayLeadoff && entryResultKey(e) === key && e[status] === "NT")
  if (index < 0) return
  const next = entries.map((e, i) => (i === index ? { ...e, [status]: undefined } : e))
  await prisma.meet.update({
    where: { id: meetId },
    data: { resultStatusesSummary: { entries: next } as unknown as Prisma.InputJsonValue },
  })
}

/**
 * Remove a meet swim's time (imported or hand-logged) but keep the athlete's row for that event:
 * the swim is deleted (so it leaves PBs, records and Top 10s) and its round is marked "NT" in the
 * meet's result details, with that round's place, points and splits cleared. Only the swim's own
 * round is touched — removing a finals time keeps the prelims swim. Relay leadoffs and splits are
 * removed through the relay. A later results import brings the time back.
 */
export async function removeMeetSwimTime(swimId: string) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    throw new Error("Forbidden")
  }

  const swim = await prisma.swim.findUnique({
    where: { id: swimId },
    include: { athlete: { select: { firstName: true, lastName: true } } },
  })
  if (!swim) throw new Error("Not found")
  if (!swim.meetId) throw new Error("Only meet swims can have their time removed")
  if (isRelayLeadoffSwimTag(swim.tags) || isRelaySplitSwimTag(swim.tags)) {
    throw new Error("Relay swims can only be changed through the relay")
  }

  const meet = await prisma.meet.findUnique({
    where: { id: swim.meetId },
    select: { resultStatusesSummary: true },
  })
  if (!meet) throw new Error("Not found")

  const swimOff = isSwimOffTag(swim.tags)
  const key = swimOff
    ? entryResultKey({ athleteId: swim.athleteId, event: swim.event, isSwimOff: true })
    : resultKey(swim.athleteId, swim.event, false)
  const fields = roundResultFields(swim.tags)
  const entries = isResultStatusesSummary(meet.resultStatusesSummary)
    ? meet.resultStatusesSummary.entries
    : []
  const index = entries.findIndex((e) => !e.isRelayLeadoff && entryResultKey(e) === key)
  const cleared: MeetResultEntry = {
    ...(index >= 0
      ? entries[index]
      : {
          athleteId: swim.athleteId,
          athleteName: `${swim.athlete.lastName}, ${swim.athlete.firstName}`,
          event: swim.event,
          ...(swimOff ? { isSwimOff: true } : {}),
        }),
    [fields.time]: undefined,
    [fields.place]: undefined,
    [fields.points]: undefined,
    [fields.splits]: undefined,
    [fields.status]: "NT",
  }
  const next = index >= 0 ? entries.map((e, i) => (i === index ? cleared : e)) : [...entries, cleared]

  await prisma.$transaction([
    prisma.swim.delete({ where: { id: swimId } }),
    prisma.meet.update({
      where: { id: swim.meetId },
      data: { resultStatusesSummary: { entries: next } as unknown as Prisma.InputJsonValue },
    }),
  ])
  await syncTeamRecordsSafely()
  revalidatePath("/meets/[id]", "page")
  return { ok: true }
}
