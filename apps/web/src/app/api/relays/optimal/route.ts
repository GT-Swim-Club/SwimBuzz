import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Course, Gender, Prisma } from "@prisma/client"
import { canonicalizeStrokeEvent } from "@/lib/swim/swim-parse"
import { getSession } from "@/lib/auth/session"
import { athletePreferredName } from "@swimbuzz/shared"
import { currentSeason } from "@/lib/season"
import { isMeetFinalRoster } from "@/lib/meet/meet-roster-import"
import { loadRelaySplits } from "@/lib/meet/relay-splits"

// medley leg → individual event name in DB
const MEDLEY_LEG_EVENTS: Record<string, string[]> = {
  back: ["100 Back", "50 Back"],
  breast: ["100 Breast", "50 Breast"],
  fly: ["100 Fly", "50 Fly"],
  free: ["100 Free", "50 Free"],
}

const RELAY_LETTERS = ["A", "B", "C", "D"] as const
const MEDLEY_LEGS = ["back", "breast", "fly", "free"] as const

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr]
  return arr.flatMap((v, i) =>
    permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [v, ...p])
  )
}

function combinations(arr: string[], k: number): string[][] {
  if (k === 0) return [[]]
  if (arr.length < k) return []
  const [first, ...rest] = arr
  return [
    ...combinations(rest, k - 1).map((c) => [first, ...c]),
    ...combinations(rest, k),
  ]
}

function parseRelayCount(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 1
  return Math.min(4, Math.max(1, Math.round(n)))
}

function fullName(
  athlete: { firstName: string; lastName: string; preferredName?: string | null } | undefined
): string {
  if (!athlete) return "Unknown"
  return athletePreferredName(athlete)
}

/** A time on record for one swimmer and stroke; relay splits only count after the lead-off. */
type TimePick = { timeMs: number; relaySplit: boolean; sourceDate: Date | null }

/** `leadoff`: flat-start best (leg 1). `rolling`: a relay split, set only when it beats leadoff for legs 2–4. */
type AthleteTimes = { leadoff?: TimePick; rolling?: TimePick }

type BuiltLeg = {
  athleteId: string
  name: string
  event: string
  timeMs: number
  sourceDate?: Date | null
  /** The source swim falls outside the preferred date range (fallback time). */
  outsideWindow?: boolean
  gender?: Gender
  leg?: string
  /** Timed from a relay split (legs 2–4 only) rather than a flat-start swim. */
  relaySplit?: boolean
}

type StrokeTime = {
  timeMs: number
  event: string
  sourceDate: Date | null
  outsideWindow: boolean
  relaySplit?: boolean
}

type StrokeTimes = Record<
  string,
  {
    name: string
    gender?: Gender
    /** Flat-start times — usable on any leg. */
    times: Record<string, StrokeTime>
    /** Faster relay-split times — usable on legs 2–4 only. */
    splitTimes?: Record<string, StrokeTime>
  }
>

type BuiltTeam = {
  letter: string
  totalMs: number
  legs: BuiltLeg[]
}

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const {
    relayEvent,
    course = "SCY",
    gender = "M",
    withinDays = null,
    limitDays = null,
    athleteIds = null,
    meetId = null,
  } = body
  const relayCount = parseRelayCount(body.relayCount ?? body.count ?? 1)

  if (!relayEvent || typeof relayEvent !== "string") {
    return NextResponse.json({ error: "relayEvent is required" }, { status: 400 })
  }

  // 4x50 / 4x100 / 4x200 → 200 / 400 / 800 (and Freestyle → Free).
  const normalizedRelay = canonicalizeStrokeEvent(relayEvent)
    .replace(/\bMixed\s+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
  const totalDist = parseInt(normalizedRelay, 10)
  if (!Number.isFinite(totalDist) || totalDist <= 0 || totalDist % 4 !== 0) {
    return NextResponse.json(
      { error: "Unrecognized relay event (expected e.g. 200 Free Relay or 4x50 Free Relay)" },
      { status: 400 }
    )
  }
  const legDist = totalDist / 4

  const isMedley = /\bmedley\b/i.test(normalizedRelay)
  const courseEnum = course as Course

  const days = Number(withinDays)
  const sinceDate =
    Number.isFinite(days) && days > 0
      ? new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      : null

  // Hard window: swims before this date are ignored entirely, even when faster.
  const limit = Number(limitDays)
  const limitDate =
    Number.isFinite(limit) && limit > 0
      ? new Date(Date.now() - limit * 24 * 60 * 60 * 1000)
      : null

  // Window to prefer: swims inside it win, else the best from any date (within the limit).
  const windowStart = sinceDate ? (limitDate && limitDate > sinceDate ? limitDate : sinceDate) : null

  const faster = (a: TimePick | undefined, b: TimePick | undefined) =>
    !a ? b : !b ? a : b.timeMs < a.timeMs ? b : a

  // Lead-off and relay-split times per athlete for one stroke's events.
  const strokeBests = async (events: string[], ids: string[]): Promise<Map<string, AthleteTimes>> => {
    const where: Prisma.SwimWhereInput = {
      event: { in: events },
      course: courseEnum,
      athleteId: { in: ids },
      ...(limitDate ? { date: { gte: limitDate } } : {}),
    }
    const [anyDate, inWindow] = await Promise.all([
      prisma.swim.groupBy({ by: ["athleteId"], where, _min: { timeMs: true } }),
      windowStart
        ? prisma.swim.groupBy({
            by: ["athleteId"],
            where: { ...where, date: { gte: windowStart } },
            _min: { timeMs: true },
          })
        : Promise.resolve([]),
    ])
    const flat = (rows: typeof anyDate) =>
      new Map(
        rows
          .filter((row) => row._min.timeMs != null)
          .map((row) => [row.athleteId, { timeMs: row._min.timeMs!, relaySplit: false, sourceDate: null }])
      )
    const flatAny = flat(anyDate)
    const flatWindow = flat(inWindow)

    const idSet = new Set(ids)
    const splitAny = new Map<string, TimePick>()
    const splitWindow = new Map<string, TimePick>()
    for (const split of relaySplits) {
      if (!idSet.has(split.athleteId) || !events.includes(split.event)) continue
      const pick = { timeMs: split.timeMs, relaySplit: true, sourceDate: split.date }
      splitAny.set(split.athleteId, faster(splitAny.get(split.athleteId), pick)!)
      if (windowStart && split.date >= windowStart) {
        splitWindow.set(split.athleteId, faster(splitWindow.get(split.athleteId), pick)!)
      }
    }

    const out = new Map<string, AthleteTimes>()
    for (const id of new Set([...flatAny.keys(), ...splitAny.keys()])) {
      const leadoff = flatWindow.get(id) ?? flatAny.get(id)
      const inWin = faster(flatWindow.get(id), splitWindow.get(id))
      const best = inWin ?? faster(flatAny.get(id), splitAny.get(id))
      out.set(id, { leadoff, rolling: best?.relaySplit ? best : undefined })
    }
    return out
  }

  /** Time for legs 2–4: a faster relay split, else the flat-start time. */
  const rollingPick = (t: AthleteTimes | undefined) => t?.rolling ?? t?.leadoff

  const sourceKey = (row: Pick<BuiltLeg, "athleteId" | "event" | "timeMs">) =>
    `${row.athleteId}|${row.event}|${row.timeMs}`
  const attachSourceDates = async (legs: BuiltLeg[]): Promise<BuiltLeg[]> => {
    if (legs.length === 0) return legs
    // Relay splits already carry their date; look up the swim behind every flat-start time.
    const swimLegs = legs.filter((leg) => !leg.relaySplit)
    const sourceSwims = swimLegs.length
      ? await prisma.swim.findMany({
          where: {
            course: courseEnum,
            ...(limitDate ? { date: { gte: limitDate } } : {}),
            OR: swimLegs.map((leg) => ({
              athleteId: leg.athleteId,
              event: leg.event,
              timeMs: leg.timeMs,
            })),
          },
          select: { athleteId: true, event: true, timeMs: true, date: true },
          orderBy: { date: "desc" },
        })
      : []
    const sourceDates = new Map<string, Date | null>()
    for (const swim of sourceSwims) {
      const key = sourceKey(swim)
      if (!sourceDates.has(key)) sourceDates.set(key, swim.date)
    }
    return legs.map((leg) => {
      const sourceDate = leg.relaySplit ? (leg.sourceDate ?? null) : (sourceDates.get(sourceKey(leg)) ?? null)
      return {
        ...leg,
        sourceDate,
        outsideWindow: sinceDate != null && (sourceDate == null || sourceDate < sinceDate),
      }
    })
  }

  const signupPool =
    Array.isArray(athleteIds) && athleteIds.every((id: unknown) => typeof id === "string")
      ? (athleteIds as string[]).filter(Boolean)
      : null
  if (signupPool && signupPool.length === 0) {
    return NextResponse.json(
      { error: "No athletes available for this relay filter" },
      { status: 400 }
    )
  }

  // Only the season roster is eligible: the meet's season, else the current one —
  // narrowed to the meet's final roster once one is imported.
  let season = currentSeason()
  let finalRoster: string[] | null = null
  if (typeof meetId === "string" && meetId) {
    const meet = await prisma.meet.findFirst({
      where: { OR: [{ id: meetId }, { slug: meetId }] },
      select: { season: true, finalRoster: true },
    })
    if (!meet) return NextResponse.json({ error: "Meet not found" }, { status: 404 })
    season = meet.season
    if (isMeetFinalRoster(meet.finalRoster)) finalRoster = meet.finalRoster.athleteIds
  }

  const eligibleAthletes = await prisma.athlete.findMany({
    where: {
      seasons: { has: season },
      ...(gender === "X" ? {} : { gender: gender as Gender }),
      AND: [
        ...(signupPool ? [{ id: { in: signupPool } }] : []),
        ...(finalRoster ? [{ id: { in: finalRoster } }] : []),
      ],
    },
    select: { id: true, firstName: true, lastName: true, preferredName: true, gender: true },
  })
  const eligibleIds = eligibleAthletes.map((a) => a.id)
  const athleteMap = Object.fromEntries(eligibleAthletes.map((a) => [a.id, a]))
  if (eligibleIds.length === 0) {
    return NextResponse.json(
      { error: "No matching athletes found for this relay" },
      { status: 400 }
    )
  }

  const relaySplits = await loadRelaySplits({ athleteIds: eligibleIds, course: courseEnum, since: limitDate })

  // Every pool athlete's time per leg stroke, so the builder can swap anyone in.
  const buildStrokeTimes = async (rows: BuiltLeg[]): Promise<StrokeTimes> => {
    const strokeTimes: StrokeTimes = {}
    for (const row of await attachSourceDates(rows)) {
      if (!row.leg) continue
      const entry = (strokeTimes[row.athleteId] ??= { name: row.name, gender: row.gender, times: {} })
      const time: StrokeTime = {
        timeMs: row.timeMs,
        event: row.event,
        sourceDate: row.sourceDate ?? null,
        outsideWindow: row.outsideWindow ?? false,
        ...(row.relaySplit ? { relaySplit: true } : {}),
      }
      if (row.relaySplit) (entry.splitTimes ??= {})[row.leg] = time
      else entry.times[row.leg] = time
    }
    return strokeTimes
  }

  const legOf = (athleteId: string, event: string, pick: TimePick, leg?: string): BuiltLeg => ({
    athleteId,
    name: fullName(athleteMap[athleteId]),
    gender: athleteMap[athleteId]?.gender,
    event,
    timeMs: pick.timeMs,
    ...(pick.relaySplit ? { relaySplit: true, sourceDate: pick.sourceDate } : {}),
    ...(leg ? { leg } : {}),
  })

  /** strokeTimes rows: each swimmer's lead-off time and, when faster, their relay split. */
  const strokeTimeRows = (times: Map<string, AthleteTimes>, event: string, stroke: string): BuiltLeg[] =>
    [...times].flatMap(([id, t]) =>
      [t.leadoff, t.rolling]
        .filter((pick): pick is TimePick => Boolean(pick))
        .map((pick) => legOf(id, event, pick, stroke))
    )

  if (!isMedley) {
    const eventName = `${legDist} Free`
    const mixed = gender === "X"

    if (mixed) {
      const hasMen = eligibleAthletes.some((a) => a.gender === Gender.M)
      const hasWomen = eligibleAthletes.some((a) => a.gender === Gender.F)
      if (!hasMen || !hasWomen) {
        return NextResponse.json(
          { error: "Mixed relays need at least one man and one woman in the pool" },
          { status: 400 }
        )
      }
    }

    const times = await strokeBests([eventName], eligibleIds)
    const strokeTimes = await buildStrokeTimes(strokeTimeRows(times, eventName, "free"))
    const rollMs = (id: string) => rollingPick(times.get(id))!.timeMs
    const leadMs = (id: string) => times.get(id)?.leadoff?.timeMs

    // Best four in the pool: three swim their legs 2–4 time (a relay split when faster) and one
    // leads off from a flat start — whoever loses the least by leading off.
    const bestFreeFromPool = (available: Set<string>) => {
      const pools = mixed
        ? [Gender.M, Gender.F].map((g) => [...available].filter((id) => athleteMap[id]?.gender === g))
        : [[...available]]
      const perPool = mixed ? 4 : 8
      const candidates = new Set<string>()
      for (const pool of pools) {
        for (const id of [...pool].sort((a, b) => rollMs(a) - rollMs(b)).slice(0, perPool)) {
          candidates.add(id)
        }
        for (const id of pool
          .filter((id) => leadMs(id) != null)
          .sort((a, b) => leadMs(a)! - leadMs(b)!)
          .slice(0, perPool)) {
          candidates.add(id)
        }
      }

      let best: { total: number; leadoff: string; rest: string[] } | null = null
      for (const combo of combinations([...candidates], 4)) {
        if (mixed && combo.filter((id) => athleteMap[id]?.gender === Gender.M).length !== 2) continue
        let leadoff: string | null = null
        let leadoffCost = Infinity
        for (const id of combo) {
          const lead = leadMs(id)
          if (lead == null) continue
          if (lead - rollMs(id) < leadoffCost) {
            leadoffCost = lead - rollMs(id)
            leadoff = id
          }
        }
        if (!leadoff) continue
        const total = combo.reduce((sum, id) => sum + rollMs(id), 0) + leadoffCost
        if (!best || total < best.total) {
          best = { total, leadoff, rest: combo.filter((id) => id !== leadoff) }
        }
      }
      return best
    }

    const available = new Set(times.keys())
    const teams: BuiltTeam[] = []
    for (let t = 0; t < relayCount; t++) {
      const found = bestFreeFromPool(available)
      if (!found) break
      available.delete(found.leadoff)
      for (const id of found.rest) available.delete(id)
      const legs = await attachSourceDates([
        legOf(found.leadoff, eventName, times.get(found.leadoff)!.leadoff!),
        ...found.rest
          .map((id) => legOf(id, eventName, rollingPick(times.get(id))!))
          .sort((a, b) => a.timeMs - b.timeMs),
      ])
      teams.push({ letter: RELAY_LETTERS[t] ?? String(t + 1), totalMs: found.total, legs })
    }

    if (teams.length === 0) {
      return NextResponse.json(
        {
          error: mixed
            ? "Not enough athletes with times to build a mixed relay"
            : "Not enough athletes with times to build a relay",
        },
        { status: 400 }
      )
    }

    const remaining = [...available].sort((a, b) => rollMs(a) - rollMs(b))
    const alternateIds = mixed
      ? [Gender.M, Gender.F].flatMap((g) => remaining.filter((id) => athleteMap[id]?.gender === g).slice(0, 4))
      : remaining.slice(0, 8)
    const alternates: BuiltLeg[] = await attachSourceDates(
      alternateIds.map((id) => legOf(id, eventName, rollingPick(times.get(id))!))
    )

    return NextResponse.json({
      relay: normalizedRelay,
      course,
      teams,
      totalMs: teams[0].totalMs,
      legs: teams[0].legs,
      alternates,
      strokeTimes,
    })
  }

  // --- MEDLEY RELAY ---
  const strokeEvent = (stroke: string) => `${legDist} ${stroke.charAt(0).toUpperCase()}${stroke.slice(1)}`
  const timeLookup: Record<string, Record<string, number>> = {}
  const pickLookup: Record<string, Record<string, TimePick>> = {}
  const strokeTimeLegs: BuiltLeg[] = []
  for (const leg of MEDLEY_LEGS) {
    const eventNames = MEDLEY_LEG_EVENTS[leg].filter((e) => e.startsWith(`${legDist}`))
    const times = await strokeBests(eventNames, eligibleIds)
    for (const [id, t] of times) {
      // Backstroke leads off from the water (flat start only); breast, fly and free follow an exchange.
      const pick = leg === "back" ? t.leadoff : rollingPick(t)
      if (!pick) continue
      ;(timeLookup[id] ??= {})[leg] = pick.timeMs
      ;(pickLookup[id] ??= {})[leg] = pick
    }
    strokeTimeLegs.push(...strokeTimeRows(times, strokeEvent(leg), leg))
  }

  function bestMedleyFromPool(available: Set<string>, isMixed: boolean) {
    const optimizerIds = new Set<string>()
    for (const stroke of MEDLEY_LEGS) {
      const ranked = [...available]
        .filter((id) => timeLookup[id]?.[stroke])
        .sort((a, b) => timeLookup[a][stroke] - timeLookup[b][stroke])
      if (isMixed) {
        for (const athleteGender of ["M", "F"]) {
          for (const id of ranked
            .filter((id) => athleteMap[id]?.gender === athleteGender)
            .slice(0, 4)) {
            optimizerIds.add(id)
          }
        }
      } else {
        for (const id of ranked.slice(0, 8)) optimizerIds.add(id)
      }
    }
    const candidates = [...optimizerIds].filter((id) => timeLookup[id])
    const combos = combinations(candidates, 4)

    let bestTotal = Infinity
    let bestAssignment: { leg: string; athleteId: string; timeMs: number }[] = []

    for (const extra of combos) {
      const combo = extra
      if (isMixed) {
        let men = 0
        let women = 0
        for (const id of combo) {
          if (athleteMap[id]?.gender === "M") men++
          else if (athleteMap[id]?.gender === "F") women++
        }
        if (men !== 2 || women !== 2) continue
      }
      for (const perm of permutations([...MEDLEY_LEGS])) {
        let total = 0
        let valid = true
        for (let i = 0; i < 4; i++) {
          const t = timeLookup[combo[i]]?.[perm[i]]
          if (!t) {
            valid = false
            break
          }
          total += t
        }
        if (valid && total < bestTotal) {
          bestTotal = total
          bestAssignment = perm.map((leg, i) => ({
            leg,
            athleteId: combo[i],
            timeMs: timeLookup[combo[i]][leg],
          }))
        }
      }
    }

    if (!bestAssignment.length || !Number.isFinite(bestTotal)) return null
    return { bestTotal, bestAssignment }
  }

  const available = new Set(Object.keys(timeLookup))
  const teams: BuiltTeam[] = []
  const LEG_ORDER = ["back", "breast", "fly", "free"]

  for (let t = 0; t < relayCount; t++) {
    const found = bestMedleyFromPool(available, gender === "X")
    if (!found) break
    for (const a of found.bestAssignment) available.delete(a.athleteId)

    const resultLegs: BuiltLeg[] = await attachSourceDates(
      found.bestAssignment
        .sort((a, b) => LEG_ORDER.indexOf(a.leg) - LEG_ORDER.indexOf(b.leg))
        .map((a) => legOf(a.athleteId, strokeEvent(a.leg), pickLookup[a.athleteId][a.leg], a.leg))
    )

    teams.push({
      letter: RELAY_LETTERS[t] ?? String(t + 1),
      totalMs: found.bestTotal,
      legs: resultLegs,
    })
  }

  if (teams.length === 0) {
    return NextResponse.json(
      { error: "Not enough athletes with times to build a medley relay" },
      { status: 400 }
    )
  }

  const usedIds = new Set(teams.flatMap((team) => team.legs.map((leg) => leg.athleteId)))
  const remainingAlts: BuiltLeg[] = []
  for (const stroke of MEDLEY_LEGS) {
    const rows = Object.entries(pickLookup)
      .filter(([id, picks]) => !usedIds.has(id) && picks[stroke] != null)
      .map(([id, picks]) => legOf(id, strokeEvent(stroke), picks[stroke], stroke))
      .sort((a, b) => a.timeMs - b.timeMs)
    if (gender === "X") {
      for (const alternateGender of [Gender.M, Gender.F]) {
        const alternate = rows.find((row) => row.gender === alternateGender)
        if (alternate) remainingAlts.push(alternate)
      }
    } else {
      remainingAlts.push(...rows.slice(0, 2))
    }
  }
  const alternates: BuiltLeg[] = await attachSourceDates(remainingAlts)
  const strokeTimes = await buildStrokeTimes(strokeTimeLegs)

  return NextResponse.json({
    relay: normalizedRelay,
    course,
    teams,
    totalMs: teams[0].totalMs,
    legs: teams[0].legs,
    alternates,
    strokeTimes,
  })
}
