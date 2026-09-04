import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { Course, Gender } from "@prisma/client"
import { canonicalizeStrokeEvent } from "@/lib/swim/swim-parse"
import { getSession } from "@/lib/auth/session"
import { athletePreferredName } from "@swimbuzz/shared"

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
  athlete: { firstName: string; lastName: string; nicknames?: string[] } | undefined
): string {
  if (!athlete) return "Unknown"
  return athletePreferredName(athlete)
}

type BestRow = { athleteId: string; timeMs: number }

type BuiltLeg = {
  athleteId: string
  name: string
  event: string
  timeMs: number
  sourceDate?: Date | null
  gender?: Gender
  leg?: string
}

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
    athleteIds = null,
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
  const dateFilter = sinceDate ? { date: { gte: sinceDate } } : {}

  const sourceKey = (row: Pick<BuiltLeg, "athleteId" | "event" | "timeMs">) =>
    `${row.athleteId}|${row.event}|${row.timeMs}`
  const attachSourceDates = async (legs: BuiltLeg[]): Promise<BuiltLeg[]> => {
    if (legs.length === 0) return legs
    const sourceSwims = await prisma.swim.findMany({
      where: {
        course: courseEnum,
        ...dateFilter,
        OR: legs.map((leg) => ({
          athleteId: leg.athleteId,
          event: leg.event,
          timeMs: leg.timeMs,
        })),
      },
      select: { athleteId: true, event: true, timeMs: true, date: true },
      orderBy: { date: "desc" },
    })
    const sourceDates = new Map<string, Date | null>()
    for (const swim of sourceSwims) {
      const key = sourceKey(swim)
      if (!sourceDates.has(key)) sourceDates.set(key, swim.date)
    }
    return legs.map((leg) => ({
      ...leg,
      sourceDate: sourceDates.get(sourceKey(leg)) ?? null,
    }))
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

  const eligibleAthletes = await prisma.athlete.findMany({
    where: {
      ...(gender === "X" ? {} : { gender: gender as Gender }),
      ...(signupPool ? { id: { in: signupPool } } : {}),
    },
    select: { id: true, firstName: true, lastName: true, nicknames: true, gender: true },
  })
  const eligibleIds = eligibleAthletes.map((a) => a.id)
  if (eligibleIds.length === 0) {
    return NextResponse.json(
      { error: "No matching athletes found for this relay" },
      { status: 400 }
    )
  }

  if (!isMedley) {
    const eventName = `${legDist} Free`

    if (gender === "X") {
      const menIds = eligibleAthletes.filter((a) => a.gender === Gender.M).map((a) => a.id)
      const womenIds = eligibleAthletes.filter((a) => a.gender === Gender.F).map((a) => a.id)

      if (menIds.length === 0 || womenIds.length === 0) {
        return NextResponse.json(
          { error: "Mixed relays need at least one man and one woman in the pool" },
          { status: 400 }
        )
      }

      const menBests = await prisma.swim.groupBy({
        by: ["athleteId"],
        where: {
          event: eventName,
          course: courseEnum,
          athleteId: { in: menIds },
          ...dateFilter,
        },
        _min: { timeMs: true },
        orderBy: { _min: { timeMs: "asc" } },
        take: relayCount * 2 + 8,
      })
      const womenBests = await prisma.swim.groupBy({
        by: ["athleteId"],
        where: {
          event: eventName,
          course: courseEnum,
          athleteId: { in: womenIds },
          ...dateFilter,
        },
        _min: { timeMs: true },
        orderBy: { _min: { timeMs: "asc" } },
        take: relayCount * 2 + 8,
      })

      const allIds = [
        ...menBests.map((b) => b.athleteId),
        ...womenBests.map((b) => b.athleteId),
      ]
      const athletes = await prisma.athlete.findMany({
        where: { id: { in: allIds } },
        select: { id: true, firstName: true, lastName: true, nicknames: true, gender: true },
      })
      const athleteMap = Object.fromEntries(athletes.map((a) => [a.id, a]))

      const menPool: BestRow[] = menBests.map((b) => ({
        athleteId: b.athleteId,
        timeMs: b._min.timeMs!,
      }))
      const womenPool: BestRow[] = womenBests.map((b) => ({
        athleteId: b.athleteId,
        timeMs: b._min.timeMs!,
      }))

      const teams: BuiltTeam[] = []
      for (let t = 0; t < relayCount; t++) {
        if (menPool.length < 2 || womenPool.length < 2) break
        const selected = [...menPool.splice(0, 2), ...womenPool.splice(0, 2)]
        const legs: BuiltLeg[] = await attachSourceDates(
          selected.map((b) => {
            const athlete = athleteMap[b.athleteId]
            return {
              athleteId: b.athleteId,
              name: fullName(athlete),
              gender: athlete?.gender,
              event: eventName,
              timeMs: b.timeMs,
            }
          })
        )
        teams.push({
          letter: RELAY_LETTERS[t] ?? String(t + 1),
          totalMs: legs.reduce((sum, l) => sum + l.timeMs, 0),
          legs,
        })
      }

      if (teams.length === 0) {
        return NextResponse.json(
          { error: "Not enough athletes with times to build a mixed relay" },
          { status: 400 }
        )
      }

      const alternates: BuiltLeg[] = await attachSourceDates(
        [...menPool.slice(0, 4), ...womenPool.slice(0, 4)].map((b) => ({
          athleteId: b.athleteId,
          name: fullName(athleteMap[b.athleteId]),
          gender: athleteMap[b.athleteId]?.gender,
          event: eventName,
          timeMs: b.timeMs,
        }))
      )

      return NextResponse.json({
        relay: normalizedRelay,
        course,
        teams,
        totalMs: teams[0].totalMs,
        legs: teams[0].legs,
        alternates,
      })
    }

    const bests = await prisma.swim.groupBy({
      by: ["athleteId"],
      where: {
        event: eventName,
        course: courseEnum,
        athleteId: { in: eligibleIds },
        ...dateFilter,
      },
      _min: { timeMs: true },
      orderBy: { _min: { timeMs: "asc" } },
      take: Math.max(20, relayCount * 4 + 8),
    })

    const athleteIdList = bests.map((b) => b.athleteId)
    const athletes = await prisma.athlete.findMany({
      where: { id: { in: athleteIdList } },
      select: { id: true, firstName: true, lastName: true, nicknames: true },
    })
    const athleteMap = Object.fromEntries(athletes.map((a) => [a.id, a]))

    const remaining = [...bests]
    const teams: BuiltTeam[] = []

    for (let t = 0; t < relayCount; t++) {
      const letter = RELAY_LETTERS[t] ?? String(t + 1)
      if (remaining.length < 4) break
      const selected = remaining.splice(0, 4)
      if (selected.length < 4) break

      const legs: BuiltLeg[] = await attachSourceDates(
        selected.map((b) => ({
          athleteId: b.athleteId,
          name: fullName(athleteMap[b.athleteId]),
          event: eventName,
          timeMs: b._min.timeMs!,
        }))
      )
      teams.push({
        letter,
        totalMs: legs.reduce((sum, l) => sum + l.timeMs, 0),
        legs,
      })
    }

    if (teams.length === 0) {
      return NextResponse.json(
        { error: "Not enough athletes with times to build a relay" },
        { status: 400 }
      )
    }

    const alternates: BuiltLeg[] = await attachSourceDates(
      remaining.slice(0, 8).map((b) => ({
        athleteId: b.athleteId,
        name: fullName(athleteMap[b.athleteId]),
        event: eventName,
        timeMs: b._min.timeMs!,
      }))
    )
    return NextResponse.json({
      relay: normalizedRelay,
      course,
      teams,
      totalMs: teams[0].totalMs,
      legs: teams[0].legs,
      alternates,
    })
  }

  // --- MEDLEY RELAY ---
  const timeLookup: Record<string, Record<string, number>> = {}
  for (const leg of MEDLEY_LEGS) {
    const eventNames = MEDLEY_LEG_EVENTS[leg].filter((e) => e.startsWith(`${legDist}`))
    const bests = await prisma.swim.groupBy({
      by: ["athleteId"],
      where: {
        event: { in: eventNames },
        course: courseEnum,
        athleteId: { in: eligibleIds },
        ...dateFilter,
      },
      _min: { timeMs: true },
      orderBy: { _min: { timeMs: "asc" } },
    })
    for (const c of bests) {
      if (c._min.timeMs == null) continue
      if (!timeLookup[c.athleteId]) timeLookup[c.athleteId] = {}
      timeLookup[c.athleteId][leg] = c._min.timeMs
    }
  }

  const allAthleteIds = Object.keys(timeLookup)
  const athletes = await prisma.athlete.findMany({
    where: { id: { in: allAthleteIds } },
    select: { id: true, firstName: true, lastName: true, nicknames: true, gender: true },
  })
  const athleteMap = Object.fromEntries(athletes.map((a) => [a.id, a]))

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
        .map((a) => ({
          leg: a.leg,
          athleteId: a.athleteId,
          timeMs: a.timeMs,
          name: fullName(athleteMap[a.athleteId]),
          gender: athleteMap[a.athleteId]?.gender,
          event: `${legDist} ${a.leg.charAt(0).toUpperCase() + a.leg.slice(1)}`,
        }))
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
    const eventName = `${legDist} ${stroke.charAt(0).toUpperCase()}${stroke.slice(1)}`
    const rows = Object.entries(timeLookup)
      .filter(([id, times]) => !usedIds.has(id) && times[stroke] != null)
      .map(([id, times]) => ({
        athleteId: id,
        name: fullName(athleteMap[id]),
        gender: athleteMap[id]?.gender,
        event: eventName,
        timeMs: times[stroke],
        leg: stroke,
      }))
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

  const strokeTimeRows: BuiltLeg[] = []
  for (const [id, times] of Object.entries(timeLookup)) {
    for (const stroke of MEDLEY_LEGS) {
      if (times[stroke] == null) continue
      strokeTimeRows.push({
        athleteId: id,
        name: fullName(athleteMap[id]),
        gender: athleteMap[id]?.gender,
        event: `${legDist} ${stroke.charAt(0).toUpperCase()}${stroke.slice(1)}`,
        timeMs: times[stroke],
        leg: stroke,
      })
    }
  }
  const strokeTimeDated = await attachSourceDates(strokeTimeRows)
  const strokeTimes: Record<
    string,
    {
      name: string
      gender?: Gender
      times: Record<string, { timeMs: number; event: string; sourceDate: Date | null }>
    }
  > = {}
  for (const row of strokeTimeDated) {
    if (!row.leg) continue
    if (!strokeTimes[row.athleteId]) {
      strokeTimes[row.athleteId] = { name: row.name, gender: row.gender, times: {} }
    }
    strokeTimes[row.athleteId].times[row.leg] = {
      timeMs: row.timeMs,
      event: row.event,
      sourceDate: row.sourceDate ?? null,
    }
  }

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
