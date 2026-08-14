"use client"
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react"
import { Skeleton } from "@/components/Skeleton"
import { useRouter } from "next/navigation"
import Modal, { ModalFooter } from "@/components/Modal"
import { formatSwimDate, formatTime } from "@/lib/utils"
import { canonicalizeStrokeEvent, relaySignupKey } from "@/lib/swim-parse"

const FALLBACK_RELAY_EVENTS = [
  "200 Free Relay",
  "400 Free Relay",
  "800 Free Relay",
  "200 Medley Relay",
  "400 Medley Relay",
]

/** Packet "4x50 Freestyle Relay" → "200 Free Relay". */
function canonicalRelayEvent(event: string): string {
  return canonicalizeStrokeEvent(event)
    .replace(/\bMixed\s+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
}

function uniqueCanonicalRelays(events: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const event of events) {
    const label = canonicalRelayEvent(event)
    const key = relaySignupKey(label)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(label)
  }
  return out
}

const TIME_WINDOWS: { label: string; days: number | null }[] = [
  { label: "All time", days: null },
  { label: "Last 6 months", days: 180 },
  { label: "Last 1 year", days: 365 },
  { label: "Last 2 years", days: 730 },
  { label: "Last 3 years", days: 1095 },
]

type SignupPool = "all" | "meet" | "relay"

type AthleteOption = {
  id: string
  name?: string
  gender?: "M" | "F"
  signupEvents?: number
}

type Leg = {
  leg?: string
  name: string
  event: string
  timeMs: number
  athleteId: string
  gender?: "M" | "F"
  sourceDate?: string | null
}

type RelayTeam = {
  letter: string
  totalMs: number
  legs: Leg[]
}

type StrokeTime = {
  timeMs: number
  event: string
  sourceDate?: string | null
}

type StrokeTimes = Record<
  string,
  { name: string; gender?: "M" | "F"; times: Record<string, StrokeTime> }
>

type RelayResult = {
  relay: string
  course: string
  teams: RelayTeam[]
  alternates?: Leg[]
  strokeTimes?: StrokeTimes
}

const MEDLEY_SLOT_STROKES = ["back", "breast", "fly", "free"] as const

function isMedleyRelay(relay: string): boolean {
  return /\bmedley\b/i.test(relay)
}

function slotStroke(index: number): string {
  return MEDLEY_SLOT_STROKES[index] ?? "free"
}

function applyStroke(person: Pick<Leg, "athleteId" | "name" | "gender">, stroke: string, strokeTimes: StrokeTimes): Leg | null {
  const data = strokeTimes[person.athleteId]
  const time = data?.times[stroke]
  if (!time) return null
  return {
    athleteId: person.athleteId,
    name: data.name || person.name,
    gender: data.gender ?? person.gender,
    event: time.event,
    timeMs: time.timeMs,
    sourceDate: time.sourceDate ?? null,
    leg: stroke,
  }
}

function rebuildMedleyAlternates(strokeTimes: StrokeTimes, usedIds: Set<string>, mixed = false): Leg[] {
  const alts: Leg[] = []
  for (const stroke of MEDLEY_SLOT_STROKES) {
    const rows = Object.entries(strokeTimes)
      .filter(([id, data]) => !usedIds.has(id) && data.times[stroke])
      .map(([id, data]) => {
        const time = data.times[stroke]
        return {
          athleteId: id,
          name: data.name,
          event: time.event,
          gender: data.gender,
          timeMs: time.timeMs,
          sourceDate: time.sourceDate ?? null,
          leg: stroke,
        }
      })
      .sort((a, b) => a.timeMs - b.timeMs)
    const alternates = mixed
      ? [
          ...rows.filter((row) => row.gender === "M").slice(0, 1),
          ...rows.filter((row) => row.gender === "F").slice(0, 1),
        ]
      : rows.slice(0, 2)
    alts.push(...alternates)
  }
  return alts
}

function normalizeResult(data: {
  relay: string
  course: string
  teams?: RelayTeam[]
  totalMs?: number
  legs?: Leg[]
  alternates?: Leg[]
  strokeTimes?: StrokeTimes
}): RelayResult {
  const teams =
    Array.isArray(data.teams) && data.teams.length > 0
      ? data.teams
      : data.legs
        ? [{ letter: "A", totalMs: data.totalMs ?? 0, legs: data.legs }]
        : []
  return {
    relay: data.relay,
    course: data.course,
    teams,
    alternates: data.alternates ? rankAlternates(data.alternates) : data.alternates,
    strokeTimes: data.strokeTimes,
  }
}

function athleteName(athlete: AthleteOption): string {
  return athlete.name?.trim() || "Unknown"
}

type RowLoc =
  | { list: "team"; letter: string; index: number }
  | { list: "alt"; index: number }

function locKey(loc: RowLoc): string {
  return loc.list === "team" ? `team:${loc.letter}:${loc.index}` : `alt:${loc.index}`
}

function sameLoc(a: RowLoc, b: RowLoc): boolean {
  if (a.list !== b.list) return false
  if (a.list === "alt" && b.list === "alt") return a.index === b.index
  return a.list === "team" && b.list === "team" && a.letter === b.letter && a.index === b.index
}

function cloneRelayResult(result: RelayResult): RelayResult {
  return JSON.parse(JSON.stringify(result)) as RelayResult
}

function lineupFingerprint(result: RelayResult): string {
  const teams = result.teams.map((team) =>
    team.legs.map((leg) => `${leg.athleteId}:${leg.event}`).join(",")
  )
  const alts = (result.alternates ?? []).map((leg) => `${leg.athleteId}:${leg.event}`)
  return JSON.stringify({ teams, alts })
}

function retotalTeams(teams: RelayTeam[]): RelayTeam[] {
  return teams.map((team) => ({
    ...team,
    totalMs: team.legs.reduce((sum, leg) => sum + leg.timeMs, 0),
  }))
}

function rankAlternates(alts: Leg[]): Leg[] {
  const strokeOrder = ["back", "breast", "fly", "free"]
  const strokeIndex = (row: Leg) => {
    const fromLeg = row.leg?.toLowerCase()
    if (fromLeg) {
      const idx = strokeOrder.indexOf(fromLeg)
      if (idx >= 0) return idx
    }
    const event = row.event.toLowerCase()
    const idx = strokeOrder.findIndex((stroke) => event.includes(stroke))
    return idx === -1 ? 99 : idx
  }
  return [...alts].sort((a, b) => {
    const strokeDiff = strokeIndex(a) - strokeIndex(b)
    if (strokeDiff !== 0) return strokeDiff
    return a.timeMs - b.timeMs
  })
}

function legAt(result: RelayResult, loc: RowLoc): Leg | null {
  if (loc.list === "alt") return result.alternates?.[loc.index] ?? null
  return result.teams.find((team) => team.letter === loc.letter)?.legs[loc.index] ?? null
}

function athleteIdAt(result: RelayResult, loc: RowLoc): string | null {
  return legAt(result, loc)?.athleteId ?? null
}

function hasValidMixedComposition(legs: Leg[]): boolean {
  if (legs.length !== 4) return false
  const men = legs.filter((leg) => leg.gender === "M").length
  const women = legs.filter((leg) => leg.gender === "F").length
  return men === 2 && women === 2
}

function preservesMixedComposition(result: RelayResult, from: RowLoc, to: RowLoc): boolean {
  if (to.list === "alt") return false
  if (from.list === "team" && from.letter === to.letter) return true
  const incoming = legAt(result, from)
  const targetTeam = result.teams.find((team) => team.letter === to.letter)
  if (!incoming || !targetTeam || to.index < 0 || to.index >= targetTeam.legs.length) return false
  const targetLegs = [...targetTeam.legs]
  const outgoing = targetLegs[to.index]
  targetLegs[to.index] = incoming
  if (!hasValidMixedComposition(targetLegs)) return false
  if (from.list !== "team") return true
  const sourceTeam = result.teams.find((team) => team.letter === from.letter)
  if (!sourceTeam || from.index < 0 || from.index >= sourceTeam.legs.length) return false
  const sourceLegs = [...sourceTeam.legs]
  sourceLegs[from.index] = outgoing
  return hasValidMixedComposition(sourceLegs)
}

function canDropOnSlot(result: RelayResult, from: RowLoc, to: RowLoc, mixed = false): boolean {
  if (to.list === "alt") return false
  if (sameLoc(from, to)) return false
  if (mixed && !preservesMixedComposition(result, from, to)) return false
  if (!isMedleyRelay(result.relay) || !result.strokeTimes) return true
  const incomingId = athleteIdAt(result, from)
  if (!incomingId) return false
  if (!result.strokeTimes[incomingId]?.times[slotStroke(to.index)]) return false
  if (from.list === "team") {
    const outgoingId = athleteIdAt(result, to)
    if (!outgoingId) return false
    if (!result.strokeTimes[outgoingId]?.times[slotStroke(from.index)]) return false
  }
  return true
}

function moveRelayRow(result: RelayResult, from: RowLoc, to: RowLoc, mixed = false): RelayResult {
  if (sameLoc(from, to)) return result
  if (from.list === "alt" && to.list === "alt") return result
  if (to.list === "alt") return result
  if (mixed && !preservesMixedComposition(result, from, to)) return result

  const teams = result.teams.map((team) => ({ ...team, legs: [...team.legs] }))
  const alts = [...(result.alternates ?? [])]
  const listFor = (loc: RowLoc): Leg[] => {
    if (loc.list === "alt") return alts
    return teams.find((team) => team.letter === loc.letter)?.legs ?? []
  }

  const fromList = listFor(from)
  const toList = listFor(to)
  if (from.index < 0 || from.index >= fromList.length) return result
  if (to.index < 0 || to.index >= toList.length) return result

  const strokeTimes = result.strokeTimes
  const medley = isMedleyRelay(result.relay) && strokeTimes

  if (medley) {
    const incoming = applyStroke(fromList[from.index], slotStroke(to.index), strokeTimes)
    if (!incoming) return result
    if (from.list === "team") {
      const displaced = applyStroke(toList[to.index], slotStroke(from.index), strokeTimes)
      if (!displaced) return result
      toList[to.index] = incoming
      fromList[from.index] = displaced
    } else {
      toList[to.index] = incoming
    }
    const usedIds = new Set(
      teams.flatMap((team) => team.legs.map((leg) => leg.athleteId))
    )
    return {
      ...result,
      teams: retotalTeams(teams),
      alternates: rebuildMedleyAlternates(strokeTimes, usedIds, mixed),
    }
  }

  if (fromList === toList) {
    const [item] = fromList.splice(from.index, 1)
    fromList.splice(to.index, 0, item)
  } else {
    const swapped = fromList[from.index]
    fromList[from.index] = toList[to.index]
    toList[to.index] = swapped
  }

  return {
    ...result,
    teams: retotalTeams(teams),
    alternates: rankAlternates(alts),
  }
}

export default function MeetRelayBuilder({
  meetId,
  defaultCourse,
  relayEvents,
  athletes = [],
  signupAthleteIds = [],
  signupAthleteIdsByEvent,
  hasImportedResults = false,
}: {
  meetId: string
  defaultCourse: string
  relayEvents: string[]
  athletes?: AthleteOption[]
  signupAthleteIds?: string[]
  signupAthleteIdsByEvent: Record<string, string[]>
  /** When true, hide "add to roster summary" actions. */
  hasImportedResults?: boolean
}) {
  const router = useRouter()
  const events = useMemo(() => {
    const canonical = uniqueCanonicalRelays(relayEvents)
    return canonical.length > 0 ? canonical : FALLBACK_RELAY_EVENTS
  }, [relayEvents])
  const [event, setEvent] = useState(() => events[0] ?? "400 Free Relay")
  const course = defaultCourse || "SCY"
  const [loading, setLoading] = useState(false)
  const [savingLetter, setSavingLetter] = useState<string | null>(null)
  const [result, setResult] = useState<RelayResult | null>(null)
  const [originalResult, setOriginalResult] = useState<RelayResult | null>(null)
  const [error, setError] = useState("")
  const [gender, setGender] = useState("M")
  const [withinDays, setWithinDays] = useState<number | null>(null)
  const [signupPool, setSignupPool] = useState<SignupPool>("meet")
  const [relayCount, setRelayCount] = useState(1)
  const [excludedIds, setExcludedIds] = useState<string[]>([])
  const [athleteQuery, setAthleteQuery] = useState("")
  const [athletePoolOpen, setAthletePoolOpen] = useState(false)
  /** Pending roster add: team letter, or "*" for all built teams. */
  const [confirmAdd, setConfirmAdd] = useState<string | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [dragFrom, setDragFrom] = useState<RowLoc | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const relayRowRefs = useRef(new Map<string, HTMLDivElement>())

  const genderLabel =
    gender === "F" ? "women's" : gender === "M" ? "men's" : "mixed"
  const genderPeople =
    gender === "F" ? "women" : gender === "M" ? "men" : "athletes"

  const athleteGender = useMemo(() => {
    const map = new Map<string, "M" | "F">()
    for (const a of athletes) {
      if (a.gender === "M" || a.gender === "F") map.set(a.id, a.gender)
    }
    return map
  }, [athletes])

  const relaySignedUpIds = useMemo(() => {
    const key = relaySignupKey(event)
    const ids = signupAthleteIdsByEvent[key] ?? []
    if (gender === "X") return ids
    return ids.filter((id) => athleteGender.get(id) === gender)
  }, [signupAthleteIdsByEvent, event, gender, athleteGender])

  const meetSignedUpIds = useMemo(() => {
    if (gender === "X") return signupAthleteIds
    return signupAthleteIds.filter((id) => athleteGender.get(id) === gender)
  }, [signupAthleteIds, gender, athleteGender])

  const poolAthletes = useMemo(() => {
    let list = athletes.filter((a) => {
      if (gender === "X") return a.gender === "M" || a.gender === "F"
      return a.gender === gender
    })
    if (signupPool === "meet") {
      const set = new Set(meetSignedUpIds)
      list = list.filter((a) => set.has(a.id))
    } else if (signupPool === "relay") {
      const set = new Set(relaySignedUpIds)
      list = list.filter((a) => set.has(a.id))
    }
    return list
  }, [athletes, gender, signupPool, meetSignedUpIds, relaySignedUpIds])

  const poolIdSet = useMemo(
    () => new Set(poolAthletes.map((a) => a.id)),
    [poolAthletes]
  )
  const excludedInPool = useMemo(
    () => excludedIds.filter((id) => poolIdSet.has(id)),
    [excludedIds, poolIdSet]
  )
  const includedAthletes = useMemo(
    () => poolAthletes.filter((a) => !excludedInPool.includes(a.id)),
    [poolAthletes, excludedInPool]
  )
  const includedIds = useMemo(
    () => includedAthletes.map((a) => a.id),
    [includedAthletes]
  )

  const poolIds =
    signupPool === "all" && excludedInPool.length === 0 ? null : includedIds
  const poolCount =
    signupPool === "relay"
      ? relaySignedUpIds.length
      : signupPool === "meet"
        ? meetSignedUpIds.length
        : null

  const visibleAthletes = useMemo(() => {
    const q = athleteQuery.trim().toLowerCase()
    if (!q) return poolAthletes
    return poolAthletes.filter((a) => athleteName(a).toLowerCase().includes(q))
  }, [poolAthletes, athleteQuery])

  const buildRelay = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true)
      setError("")
      setResult(null)
      setOriginalResult(null)

      if (poolIds && poolIds.length === 0) {
        setError(
          excludedInPool.length > 0
            ? `No ${genderPeople} left in the pool. Include at least four athletes.`
            : signupPool === "relay"
              ? `No ${genderPeople} signed up for this relay yet.`
              : `No ${genderPeople} have signed up for this meet yet.`
        )
        setLoading(false)
        return
      }

      try {
        const res = await fetch("/api/relays/optimal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({
            relayEvent: event,
            course,
            gender,
            withinDays,
            relayCount,
            ...(poolIds ? { athleteIds: poolIds } : {}),
          }),
        })
        const data = await res.json()
        if (signal.aborted) return
        if (res.ok) {
          const next = normalizeResult(data)
          setResult(next)
          setOriginalResult(cloneRelayResult(next))
        } else {
          setError(data.error ?? "Something went wrong")
        }
      } catch {
        if (!signal.aborted) setError("Something went wrong")
      } finally {
        if (!signal.aborted) setLoading(false)
      }
    },
    [
      course,
      event,
      gender,
      genderPeople,
      poolIds,
      relayCount,
      signupPool,
      withinDays,
      excludedInPool.length,
    ]
  )

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void buildRelay(controller.signal)
    }, 200)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [buildRelay])

  function toggleIncluded(id: string) {
    setExcludedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
    setResult(null)
  }

  function includeAll() {
    setExcludedIds((prev) => prev.filter((id) => !poolIdSet.has(id)))
    setResult(null)
  }

  function excludeAll() {
    setExcludedIds((prev) => {
      const next = new Set(prev)
      for (const a of poolAthletes) next.add(a.id)
      return [...next]
    })
    setResult(null)
  }

  function requestAddTeam(team: RelayTeam) {
    if (hasImportedResults || !result || savingLetter) return
    if (team.legs.length !== 4 || team.legs.some((l) => !l.athleteId)) {
      setError(`Built ${team.letter} relay is missing four athletes.`)
      return
    }
    setConfirmError(null)
    setConfirmAdd(team.letter)
  }


  function revertLineup() {
    if (!originalResult || savingLetter) return
    setResult(cloneRelayResult(originalResult))
  }

  const lineupChanged =
    result != null &&
    originalResult != null &&
    lineupFingerprint(result) !== lineupFingerprint(originalResult)

  function captureRelayRowPositions(): Map<string, DOMRect> {
    return new Map(
      [...relayRowRefs.current].map(([athleteId, row]) => [
        athleteId,
        row.getBoundingClientRect(),
      ])
    )
  }

  function animateRelayRowSwap(previousPositions: Map<string, DOMRect>) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    window.requestAnimationFrame(() => {
      for (const [athleteId, previous] of previousPositions) {
        const row = relayRowRefs.current.get(athleteId)
        if (!row) continue
        const offsetY = previous.top - row.getBoundingClientRect().top
        if (Math.abs(offsetY) < 1) continue
        row.getAnimations().forEach((animation) => animation.cancel())
        row.animate(
          [
            {
              transform: `translateY(${offsetY}px)`,
              backgroundColor:
                "color-mix(in srgb, var(--brand-color-primary) 18%, transparent)",
            },
            { transform: "translateY(0)", backgroundColor: "transparent" },
          ],
          { duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
        )
      }
    })
  }

  function endDrag() {
    setDragFrom(null)
    setDropTarget(null)
  }

  function handleRowDragStart(event: DragEvent<HTMLElement>, loc: RowLoc) {
    setDragFrom(loc)
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", locKey(loc))
  }

  function handleRowDragOver(event: DragEvent<HTMLElement>, loc: RowLoc) {
    if (loc.list === "alt") return
    if (result && dragFrom && !canDropOnSlot(result, dragFrom, loc, gender === "X")) {
      event.dataTransfer.dropEffect = "none"
      setDropTarget(null)
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    setDropTarget(locKey(loc))
  }

  function handleRowDragLeave(event: DragEvent<HTMLElement>, loc: RowLoc) {
    if (event.currentTarget.contains(event.relatedTarget as Node)) return
    setDropTarget((current) => (current === locKey(loc) ? null : current))
  }

  function handleRowDrop(event: DragEvent<HTMLElement>, to: RowLoc) {
    event.preventDefault()
    if (to.list === "alt") {
      endDrag()
      return
    }
    if (dragFrom && result && canDropOnSlot(result, dragFrom, to, gender === "X")) {
      const previousPositions = captureRelayRowPositions()
      setResult((current) =>
        current ? moveRelayRow(current, dragFrom, to, gender === "X") : current
      )
      animateRelayRowSwap(previousPositions)
    }
    endDrag()
  }

  async function confirmAddToRoster() {
    if (hasImportedResults || !result || !confirmAdd || savingLetter) return

    const teams =
      confirmAdd === "*"
        ? result.teams
        : result.teams.filter((t) => t.letter === confirmAdd)
    if (teams.length === 0) {
      setConfirmError("Relay not found.")
      return
    }

    setSavingLetter(confirmAdd)
    setConfirmError(null)
    setError("")
    try {
      for (const team of teams) {
        if (team.legs.length !== 4 || team.legs.some((l) => !l.athleteId)) {
          setConfirmError(`Built ${team.letter} relay is missing four athletes.`)
          return
        }
        const res = await fetch(`/api/meets/${meetId}/relays`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: result.relay,
            gender,
            relayLetter: team.letter,
            relayRound: "",
            seedTime: formatTime(team.totalMs),
            legs: team.legs.map((leg, i) => ({
              leg: i + 1,
              athleteId: leg.athleteId,
            })),
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setConfirmError(
            data.error ??
              (teams.length > 1
                ? `Failed to add ${team.letter} relay to roster summary`
                : "Failed to add relay to roster summary")
          )
          return
        }
      }
      setConfirmAdd(null)
      router.refresh()
    } catch {
      setConfirmError(
        teams.length > 1
          ? "Failed to add relays to roster summary"
          : "Failed to add relay to roster summary"
      )
    } finally {
      setSavingLetter(null)
    }
  }

  const confirmTeam =
    confirmAdd && confirmAdd !== "*" && result
      ? result.teams.find((t) => t.letter === confirmAdd) ?? null
      : null
  const confirmBusy = savingLetter != null
  const confirmTitle =
    confirmAdd === "*"
      ? "Add relays to roster summary?"
      : "Add relay to roster summary?"
  const confirmDescription =
    confirmAdd === "*" && result
      ? `Add ${result.teams.length} ${genderLabel} ${result.relay} relay${result.teams.length === 1 ? "" : "s"} (${result.teams.map((t) => t.letter).join(", ")}) as roster seeds.`
      : confirmTeam && result
        ? `Add this ${genderLabel} ${result.relay} ${confirmTeam.letter} as a roster seed (${formatTime(confirmTeam.totalMs)}).`
        : undefined

  const eventChoices = events

  return (
    <>
      <div className="space-y-5">
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background">
          <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-6">
            <p className="shrink-0 text-sm font-medium text-foreground sm:w-36">Gender</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Gender">
              {[
                { value: "F", label: "Women" },
                { value: "M", label: "Men" },
                { value: "X", label: "Mixed" },
              ].map((option) => {
                const active = gender === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setGender(option.value)
                      setResult(null)
                    }}
                    aria-pressed={active}
                    className={
                      "rounded-md border px-3 py-1.5 text-sm transition-colors " +
                      (active
                        ? "border-primary bg-primary text-primary-text"
                        : "border-border bg-background text-foreground hover:bg-fill-secondary")
                    }
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>

          <label className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-6">
            <span className="shrink-0 text-sm font-medium text-foreground sm:w-36">Event</span>
            <select
              value={event}
              onChange={(e) => {
                setEvent(e.target.value)
                setResult(null)
              }}
              className="w-full max-w-sm border border-border rounded-lg px-3 py-2 text-sm bg-background sm:w-auto"
            >
              {eventChoices.map((choice) => (
                <option key={choice}>{choice}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-6">
            <span className="shrink-0 text-sm font-medium text-foreground sm:w-36">Times From</span>
            <select
              value={withinDays ?? ""}
              onChange={(e) =>
                setWithinDays(e.target.value === "" ? null : Number(e.target.value))
              }
              className="w-full max-w-sm border border-border rounded-lg px-3 py-2 text-sm bg-background sm:w-auto"
            >
              {TIME_WINDOWS.map((window) => (
                <option key={window.label} value={window.days ?? ""}>
                  {window.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-6">
            <p className="shrink-0 text-sm font-medium text-foreground sm:w-36">Relays</p>
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Relays">
              {["A", "B", "C", "D"].map((letter, index) => {
                const count = index + 1
                const active = relayCount >= count
                const canToggle = active ? count !== 1 || relayCount > 1 : relayCount === count - 1
                return (
                  <button
                    key={letter}
                    type="button"
                    onClick={() => {
                      if (!canToggle) return
                      setRelayCount(active ? count - 1 : count)
                      setResult(null)
                    }}
                    disabled={!canToggle}
                    aria-pressed={active}
                    className={
                      "rounded-md border px-3 py-1.5 text-sm transition-colors " +
                      (active
                        ? "border-primary bg-primary text-primary-text"
                        : canToggle
                          ? "border-border bg-background text-foreground hover:bg-fill-secondary"
                          : "cursor-not-allowed border-border bg-fill-secondary text-foreground-tertiary opacity-60")
                    }
                  >
                    {letter}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-6">
            <p className="shrink-0 text-sm font-medium text-foreground sm:w-36">Athlete Pool</p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={signupPool}
                onChange={(e) => {
                  setSignupPool(e.target.value as SignupPool)
                  setResult(null)
                }}
                aria-label="Athlete pool"
                className="w-full max-w-sm border border-border rounded-lg px-3 py-2 text-sm bg-background sm:w-auto"
              >
                <option value="meet">Signed up for meet</option>
                <option value="relay">Signed up for relay</option>
                <option value="all">All athletes</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  setAthleteQuery("")
                  setAthletePoolOpen(true)
                }}
                aria-haspopup="dialog"
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-fill-secondary transition-colors"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                  <path d="M3 5h18l-7 8v5l-4 2v-7L3 5z" />
                </svg>
                <span>Refine athletes</span>
              </button>
            </div>
          </div>
        </div>
        <Modal
          open={athletePoolOpen}
          onClose={() => {
            setAthletePoolOpen(false)
            setAthleteQuery("")
          }}
          title="Refine athletes"
          description="Choose the swimmers to consider when building this relay lineup."
          maxWidth="lg"
          footer={
            <ModalFooter>
              <button
                type="button"
                onClick={() => {
                  setAthletePoolOpen(false)
                  setAthleteQuery("")
                }}
                className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm hover:bg-fill-secondary"
              >
                Done
              </button>
            </ModalFooter>
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <label className="block">
                <span className="mb-1 block text-xs text-foreground-secondary">Athlete pool</span>
                <select
                  value={signupPool}
                  onChange={(e) => {
                    setSignupPool(e.target.value as SignupPool)
                    setAthleteQuery("")
                    setResult(null)
                  }}
                  aria-label="Athlete pool"
                  className="w-auto border border-border-secondary rounded-lg px-3 py-1.5 text-sm bg-background"
                >
                  <option value="meet">Signed up for meet</option>
                  <option value="relay">Signed up for relay</option>
                  <option value="all">All athletes</option>
                </select>
              </label>
              <p className="mt-2 text-xs text-foreground-secondary">
                {includedAthletes.length} of {poolAthletes.length} included
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={includeAll}
                disabled={excludedInPool.length === 0}
                className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-fill-secondary disabled:opacity-40"
              >
                Include all
              </button>
              <button
                type="button"
                onClick={excludeAll}
                disabled={includedAthletes.length === 0}
                className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-fill-secondary disabled:opacity-40"
              >
                Exclude all
              </button>
            </div>
          </div>

          <div>
            <input
              type="search"
              value={athleteQuery}
              onChange={(e) => setAthleteQuery(e.target.value)}
              placeholder="Search athletes"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background focus:rin          ring-primary outline-none"
            />
            {poolCount != null && poolCount === 0 ? (
              <p className="mt-2 text-xs text-foreground-secondary">
                {signupPool === "relay"
                  ? `No ${genderPeople} signed up for this relay yet.`
                  : `No ${genderPeople} signed up for this meet yet.`}
              </p>
            ) : null}
          </div>

          {visibleAthletes.length === 0 ? (
            poolAthletes.length === 0 && poolCount === 0 ? null : (
              <p className="py-2 text-sm text-foreground-secondary">
                {poolAthletes.length === 0
                  ? `No ${genderPeople} in this pool.`
                  : "No matching athletes."}
              </p>
            )
          ) : (
            <ul className="space-y-1.5">
              {visibleAthletes.map((athlete) => {
                const included = !excludedInPool.includes(athlete.id)
                const name = athleteName(athlete)
                return (
                  <li key={athlete.id}>
                    <label
                      className={
                        "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors " +
                        (included
                          ? "border-primary/50 bg-primary/10 cursor-pointer"
                          : "border-border-secondary bg-background cursor-pointer hover:bg-fill-secondary")
                      }
                    >
                      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                        <input
                          type="checkbox"
                          checked={included}
                          onChange={() => toggleIncluded(athlete.id)}
                          className="peer sr-only"
                        />
                        <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-[3px] border border-border-secondary bg-background transition-colors peer-checked:border-[var(--brand-color-primary)] peer-checked:bg-[var(--brand-color-primary)] peer-focus-visible:ring-2 peer-focus-visible:ring-primary">
                          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5 text-[var(--brand-primary-palette-1)]">
                            <path d="m3.25 8.25 3 3 6.5-6.5" />
                          </svg>
                        </span>
                      </span>
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-medium text-primary">
                        {name.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {name}
                        </p>
                        <p className="text-xs text-foreground-secondary">
                          {included ? "Included" : "Excluded"}
                          {gender === "X" && athlete.gender ? ` · ${athlete.gender}` : ""}
                          {(athlete.signupEvents ?? 0) > 0
                            ? ` · ${athlete.signupEvents} ${athlete.signupEvents === 1 ? "event" : "events"}`
                            : ""}
                        </p>
                      </div>
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </Modal>

        {error && <p className="text-sm text-red-500">{error}</p>}

        {loading && (
          <div
            className="space-y-3"
            role="status"
            aria-live="polite"
            aria-label="Building relay teams"
          >
            <span className="sr-only">Building relay teams</span>
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-8 w-28" />
            </div>
            <div className="overflow-hidden rounded-lg border border-border bg-background">
              <div className="divide-y divide-border">
                {[0, 1, 2, 3].map((index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between px-4 py-2.5"
                  >
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-6 w-6" />
                      <div className="space-y-1.5">
                        <Skeleton className="h-3.5 w-32" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                    </div>
                    <Skeleton className="h-4 w-14" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {result && result.teams.length > 0 && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-foreground-secondary">
                Drag swimmers to change order, move between relays, or swap in an alternate.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={revertLineup}
                  disabled={!lineupChanged || savingLetter != null}
                  className="px-4 py-2 text-sm rounded-lg border border-border bg-background hover:bg-fill disabled:opacity-40 transition-colors"
                >
                  Revert to original
                </button>
              </div>
            </div>
            {result.teams.map((team) => (
              <div key={team.letter} className="overflow-hidden rounded-lg border border-border bg-background">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-medium text-foreground">
                      {`${gender === "F" ? "Women's" : gender === "M" ? "Men's" : "Mixed"} ${result.relay} - ${team.letter}`}
                    </span>
                    <span className="font-mono text-sm font-medium">
                      {formatTime(team.totalMs)}
                    </span>
                  </div>
                  {!hasImportedResults && (
                    <button
                      type="button"
                      onClick={() => requestAddTeam(team)}
                      disabled={savingLetter != null}
                      className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-text hover:bg-primary-hover disabled:opacity-50 transition-colors"
                    >
                      {savingLetter === team.letter
                        ? "Adding…"
                        : "Add To Roster Summary"}
                    </button>
                  )}
                </div>

                <div className="divide-y divide-border">
                  {team.legs.map((leg, i) => {
                    const loc: RowLoc = { list: "team", letter: team.letter, index: i }
                    const key = locKey(loc)
                    const isDragging = dragFrom != null && locKey(dragFrom) === key
                    const isDropTarget = dropTarget === key && !isDragging
                    return (
                      <div
                        key={leg.athleteId || key}
                        ref={(element) => {
                          if (element) relayRowRefs.current.set(leg.athleteId, element)
                          else relayRowRefs.current.delete(leg.athleteId)
                        }}
                        draggable={savingLetter == null}
                        onDragStart={(event) => handleRowDragStart(event, loc)}
                        onDragOver={(event) => handleRowDragOver(event, loc)}
                        onDragLeave={(event) => handleRowDragLeave(event, loc)}
                        onDrop={(event) => handleRowDrop(event, loc)}
                        onDragEnd={endDrag}
                        className={
                          "flex items-center justify-between px-4 py-2.5 " +
                          (savingLetter == null ? "cursor-grab active:cursor-grabbing " : "") +
                          (isDragging ? "opacity-40 " : "") +
                          (isDropTarget ? "bg-primary/10 " : "")
                        }
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex h-6 w-6 items-center justify-center rounded-sm border border-primary/30 bg-primary/20 text-xs font-medium text-primary dark:bg-primary/20 dark:text-primary">
                            {i + 1}
                          </span>
                          <div>
                            <p className="flex items-center gap-1.5 text-sm font-medium">
                              <span>{leg.name}</span>
                              {gender === "X" && leg.gender ? (
                                <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                  {leg.gender}
                                </span>
                              ) : null}
                            </p>
                            <p className="text-xs text-foreground-secondary">{leg.event}</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end text-right leading-tight">
                          <span className="font-mono text-sm">{formatTime(leg.timeMs)}</span>
                          {leg.sourceDate ? (
                            <span className="mt-0.5 text-[11px] text-foreground-secondary">{formatSwimDate(leg.sourceDate)}</span>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            {result.alternates && result.alternates.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground-secondary">
                  Alternates
                </h4>
                <div className="divide-y divide-border border-y border-border">
                  {result.alternates.map((alt, i) => {
                    const loc: RowLoc = { list: "alt", index: i }
                    const key = locKey(loc)
                    const isDragging = dragFrom != null && locKey(dragFrom) === key
                    return (
                      <div
                        key={`${alt.athleteId}-${alt.event}-${i}`}
                        ref={(element) => {
                          if (element) relayRowRefs.current.set(alt.athleteId, element)
                          else relayRowRefs.current.delete(alt.athleteId)
                        }}
                        draggable={savingLetter == null}
                        onDragStart={(event) => handleRowDragStart(event, loc)}
                        onDragEnd={endDrag}
                        className={
                          "flex items-center justify-between py-2.5 text-sm " +
                          (savingLetter == null ? "cursor-grab active:cursor-grabbing " : "") +
                          (isDragging ? "opacity-40 " : "")
                        }
                      >
                        <div>
                          <p className="flex items-center gap-1.5 text-sm text-foreground-secondary">
                            <span>{alt.name}</span>
                            {gender === "X" && alt.gender ? (
                              <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                {alt.gender}
                              </span>
                            ) : null}
                          </p>
                          <p className="text-xs text-foreground-secondary">{alt.event}</p>
                        </div>
                        <div className="flex flex-col items-end leading-tight">
                          <span className="font-mono tabular-nums text-foreground-secondary">
                            {formatTime(alt.timeMs)}
                          </span>
                          {alt.sourceDate ? (
                            <span className="mt-0.5 text-[11px] text-foreground-secondary">{formatSwimDate(alt.sourceDate)}</span>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <Modal
        open={confirmAdd != null}
        onClose={() => {
          if (confirmBusy) return
          setConfirmAdd(null)
          setConfirmError(null)
        }}
        closeDisabled={confirmBusy}
        busy={confirmBusy}
        title={confirmTitle}
        description={confirmDescription}
        maxWidth="md"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => {
                setConfirmAdd(null)
                setConfirmError(null)
              }}
              disabled={confirmBusy}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium bg-background hover:bg-fill disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void confirmAddToRoster()}
              disabled={confirmBusy}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
            >
              {confirmBusy ? "Adding…" : confirmAdd === "*" ? "Add all" : "Add"}
            </button>
          </ModalFooter>
        }
      >
        {confirmError ? (
          <p className="text-sm text-red-600 dark:text-red-400">{confirmError}</p>
        ) : null}
      </Modal>
    </>
  )
}
