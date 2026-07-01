import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/app/api/auth/[...nextauth]/route"
import { prisma } from "@/lib/prisma"
import { Course } from "@prisma/client"
import { Gender } from "@prisma/client"

// medley leg → individual event name in DB
const MEDLEY_LEG_EVENTS: Record<string, string[]> = {
  back:   ["100 Back", "50 Back"],
  breast: ["100 Breast", "50 Breast"],
  fly:    ["100 Fly", "50 Fly"],
  free:   ["100 Free", "50 Free"],
}

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr]
  return arr.flatMap((v, i) =>
    permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map(p => [v, ...p])
  )
}

export async function POST(req: Request) {
    const session = await getServerSession(authOptions)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { relayEvent, course = "SCY", lockedSwimmerIds = [] , gender = "M" } = await req.json()
    // relayEvent: "400 Free Relay" | "200 Free Relay" | "800 Free Relay" | "400 Medley Relay" | "200 Medley Relay"

    const isMedley = relayEvent.includes("Medley")
    const courseEnum = course as Course

    // get athlete IDs filtered by gender first
    const eligibleAthletes = await prisma.athlete.findMany({
        where: gender === "X" ? {} : { gender: gender as Gender },
        select: { id: true },
    })
    const eligibleIds = eligibleAthletes.map(a => a.id)

  if (!isMedley) {
    // --- FREE RELAY ---
    // parse leg distance from event name e.g. "400 Free Relay" → 100, "200 Free Relay" → 50
    const totalDist = parseInt(relayEvent)
    const legDist = totalDist / 4
    const eventName = `${legDist} Free`

    // get best time per athlete for this event
    if (gender === "X") {
        // mixed: top 2 men + top 2 women by best time for the leg event
        const menAthletes = await prisma.athlete.findMany({
          where: { gender: Gender.M },
          select: { id: true },
        })
        const womenAthletes = await prisma.athlete.findMany({
          where: { gender: Gender.F },
          select: { id: true },
        })
      
        const menIds = menAthletes.map(a => a.id)
        const womenIds = womenAthletes.map(a => a.id)
      
        const menBests = await prisma.swim.groupBy({
          by: ["athleteId"],
          where: { event: eventName, course: courseEnum, athleteId: { in: menIds } },
          _min: { timeMs: true },
          orderBy: { _min: { timeMs: "asc" } },
          take: 2,
        })
      
        const womenBests = await prisma.swim.groupBy({
          by: ["athleteId"],
          where: { event: eventName, course: courseEnum, athleteId: { in: womenIds } },
          _min: { timeMs: true },
          orderBy: { _min: { timeMs: "asc" } },
          take: 2,
        })
      
        const selected = [...menBests, ...womenBests]
        const athleteIds = selected.map(b => b.athleteId)
        const athletes = await prisma.athlete.findMany({
          where: { id: { in: athleteIds } },
          select: { id: true, firstName: true, lastName: true, gender: true },
        })
        const athleteMap = Object.fromEntries(athletes.map(a => [a.id, a]))
      
        const legs = selected.map(b => ({
          athleteId: b.athleteId,
          name: athleteMap[b.athleteId]
            ? `${athleteMap[b.athleteId].firstName} ${athleteMap[b.athleteId].lastName}`
            : "Unknown",
          gender: athleteMap[b.athleteId]?.gender,
          event: eventName,
          timeMs: b._min.timeMs!,
        }))
      
        const totalMs = legs.reduce((sum, l) => sum + l.timeMs, 0)
        return NextResponse.json({ relay: relayEvent, course, totalMs, legs })
      }
    else {
        const bests = await prisma.swim.groupBy({
            by: ["athleteId"],
            where: {
            event: eventName,
            course: courseEnum,
            athleteId: { in: eligibleIds },  // 👈
            },
            _min: { timeMs: true },
            orderBy: { _min: { timeMs: "asc" } },
            take: 20,
        })

        // fetch athlete names
        const athleteIds = bests.map(b => b.athleteId)
        const athletes = await prisma.athlete.findMany({
        where: { id: { in: athleteIds } },
        select: { id: true, firstName: true, lastName: true },
        })
        const athleteMap = Object.fromEntries(athletes.map(a => [a.id, a]))

        // locked swimmers go first, fill remaining spots with fastest available
        const locked = bests.filter(b => lockedSwimmerIds.includes(b.athleteId))
        const unlocked = bests.filter(b => !lockedSwimmerIds.includes(b.athleteId))
        const spotsLeft = 4 - locked.length
        const selected = [...locked, ...unlocked.slice(0, spotsLeft)]

        const legs = selected.map(b => ({
        athleteId: b.athleteId,
        name: athleteMap[b.athleteId]
            ? `${athleteMap[b.athleteId].firstName} ${athleteMap[b.athleteId].lastName}`
            : "Unknown",
        event: eventName,
        timeMs: b._min.timeMs!,
        }))

        const totalMs = legs.reduce((sum, l) => sum + l.timeMs, 0)

        return NextResponse.json({
        relay: relayEvent,
        course,
        totalMs,
        legs,
        alternates: unlocked.slice(spotsLeft, spotsLeft + 4).map(b => ({
            athleteId: b.athleteId,
            name: athleteMap[b.athleteId]
            ? `${athleteMap[b.athleteId].firstName} ${athleteMap[b.athleteId].lastName}`
            : "Unknown",
            event: eventName,
            timeMs: b._min.timeMs!,
        })),
        })
    }
  } else {
    // --- MEDLEY RELAY ---
    const totalDist = parseInt(relayEvent)
    const legDist = totalDist / 4  // 50 or 100

    const legs = ["back", "breast", "fly", "free"]

    // for each leg, get top candidates with their best time
    const legCandidates: Record<string, { athleteId: string; timeMs: number }[]> = {}

    for (const leg of legs) {

      const eventNames = MEDLEY_LEG_EVENTS[leg]
        .filter(e => e.startsWith(`${legDist}`))

      const bests = await prisma.swim.groupBy({
        by: ["athleteId"],
        where: { event: { in: eventNames }, course: courseEnum, athleteId: { in: eligibleIds } },
        _min: { timeMs: true },
        orderBy: { _min: { timeMs: "asc" } },
        take: 10,
      })

      legCandidates[leg] = bests.map(b => ({
        athleteId: b.athleteId,
        timeMs: b._min.timeMs!,
      }))
    }

    // get all unique athlete IDs across all legs
    const allAthleteIds = [...new Set(
      Object.values(legCandidates).flat().map(c => c.athleteId)
    )]

    const athletes = await prisma.athlete.findMany({
      where: { id: { in: allAthleteIds } },
      select: { id: true, firstName: true, lastName: true },
    })
    const athleteMap = Object.fromEntries(athletes.map(a => [a.id, a]))

    // build lookup: athleteId → timeMs per leg
    const timeLookup: Record<string, Record<string, number>> = {}
    for (const leg of legs) {
      for (const c of legCandidates[leg]) {
        if (!timeLookup[c.athleteId]) timeLookup[c.athleteId] = {}
        timeLookup[c.athleteId][leg] = c.timeMs
      }
    }

    // find athletes that have times for at least one leg
    const candidates = Object.keys(timeLookup)

    // try all 4-athlete combinations and all leg assignments
    let bestTotal = Infinity
    let bestAssignment: { leg: string; athleteId: string; timeMs: number }[] = []

    // get all combos of 4 athletes from candidates
    function combinations(arr: string[], k: number): string[][] {
      if (k === 0) return [[]]
      if (arr.length < k) return []
      const [first, ...rest] = arr
      return [
        ...combinations(rest, k - 1).map(c => [first, ...c]),
        ...combinations(rest, k),
      ]
    }

    for (const combo of combinations(candidates, 4)) {
      // try all assignments of these 4 swimmers to 4 legs
      for (const perm of permutations(legs)) {
        let total = 0
        let valid = true
        for (let i = 0; i < 4; i++) {
          const swimmer = combo[i]
          const leg = perm[i]
          const t = timeLookup[swimmer]?.[leg]
          if (!t) { valid = false; break }
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

    const LEG_ORDER = ["back", "breast", "fly", "free"]

    const resultLegs = bestAssignment
        .sort((a, b) => LEG_ORDER.indexOf(a.leg) - LEG_ORDER.indexOf(b.leg))
        .map(a => ({
        ...a,
        name: athleteMap[a.athleteId]
        ? `${athleteMap[a.athleteId].firstName} ${athleteMap[a.athleteId].lastName}`
        : "Unknown",
        event: `${legDist} ${a.leg.charAt(0).toUpperCase() + a.leg.slice(1)}`,
    }))

    return NextResponse.json({
      relay: relayEvent,
      course,
      totalMs: bestTotal,
      legs: resultLegs,
    })
  }
}