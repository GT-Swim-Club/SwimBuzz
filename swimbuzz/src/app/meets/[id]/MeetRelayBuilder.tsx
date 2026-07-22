"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Modal, { ModalFooter } from "@/components/Modal"
import { formatTime } from "@/lib/utils"
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

type Leg = {
  leg?: string
  name: string
  event: string
  timeMs: number
  athleteId: string
}

type RelayTeam = {
  letter: string
  totalMs: number
  legs: Leg[]
}

type RelayResult = {
  relay: string
  course: string
  teams: RelayTeam[]
  alternates?: Leg[]
}

function normalizeResult(data: {
  relay: string
  course: string
  teams?: RelayTeam[]
  totalMs?: number
  legs?: Leg[]
  alternates?: Leg[]
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
    alternates: data.alternates,
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
  athletes?: Array<{ id: string; gender?: "M" | "F" }>
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
  const [error, setError] = useState("")
  const [gender, setGender] = useState("M")
  const [withinDays, setWithinDays] = useState<number | null>(null)
  const [signupPool, setSignupPool] = useState<SignupPool>("all")
  const [relayCount, setRelayCount] = useState(1)
  /** Pending roster add: team letter, or "*" for all built teams. */
  const [confirmAdd, setConfirmAdd] = useState<string | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)

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

  const poolIds =
    signupPool === "relay"
      ? relaySignedUpIds
      : signupPool === "meet"
        ? meetSignedUpIds
        : null
  const poolCount =
    signupPool === "relay"
      ? relaySignedUpIds.length
      : signupPool === "meet"
        ? meetSignedUpIds.length
        : null

  async function handleBuild() {
    setLoading(true)
    setError("")
    setResult(null)

    if (poolIds && poolIds.length === 0) {
      setError(
        signupPool === "relay"
          ? `No ${genderPeople} signed up for this relay yet.`
          : `No ${genderPeople} have signed up for this meet yet.`
      )
      setLoading(false)
      return
    }

    const res = await fetch("/api/relays/optimal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    if (res.ok) {
      setResult(normalizeResult(data))
    } else {
      setError(data.error ?? "Something went wrong")
    }
    setLoading(false)
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

  function requestAddAll() {
    if (hasImportedResults || !result?.teams.length || savingLetter) return
    setConfirmError(null)
    setConfirmAdd("*")
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

  const eventChoices = events.filter((e) =>
    gender === "X" ? !/\bmedley\b/i.test(e) : true
  )

  return (
    <section>
      <h2 className="text-sm font-medium text-foreground-secondary text-foreground-secondary uppercase tracking-wide mb-3">
        Relay builder
      </h2>
      <div className="rounded-xl border border-border border-border-secondary bg-background p-4 space-y-4 bg-background">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-foreground-secondary text-foreground-secondary mb-1 block">Gender</label>
            <select
              value={gender}
              onChange={(e) => {
                const next = e.target.value
                setGender(next)
                setResult(null)
                if (next === "X" && /\bmedley\b/i.test(event)) {
                  setEvent(eventChoices.find((ev) => !/\bmedley\b/i.test(ev)) ?? event)
                }
              }}
              className="border border-border border-border-secondary rounded-lg px-3 py-2 text-sm bg-background border-border-secondary"
            >
              <option value="M">Men</option>
              <option value="F">Women</option>
              {!/\bmedley\b/i.test(event) && <option value="X">Mixed</option>}
            </select>
          </div>
          <div>
            <label className="text-xs text-foreground-secondary text-foreground-secondary mb-1 block">Event</label>
            <select
              value={event}
              onChange={(e) => {
                setEvent(e.target.value)
                setResult(null)
              }}
              className="border border-border border-border-secondary rounded-lg px-3 py-2 text-sm bg-background border-border-secondary"
            >
              {eventChoices.map((e) => (
                <option key={e}>{e}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-foreground-secondary text-foreground-secondary mb-1 block">Times from</label>
            <select
              value={withinDays ?? ""}
              onChange={(e) =>
                setWithinDays(e.target.value === "" ? null : Number(e.target.value))
              }
              className="border border-border border-border-secondary rounded-lg px-3 py-2 text-sm bg-background border-border-secondary"
            >
              {TIME_WINDOWS.map((w) => (
                <option key={w.label} value={w.days ?? ""}>
                  {w.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-foreground-secondary text-foreground-secondary mb-1 block">Relays</label>
            <select
              value={relayCount}
              onChange={(e) => {
                setRelayCount(Number(e.target.value))
                setResult(null)
              }}
              className="border border-border border-border-secondary rounded-lg px-3 py-2 text-sm bg-background border-border-secondary"
            >
              <option value={1}>1 (A)</option>
              <option value={2}>2 (A–B)</option>
              <option value={3}>3 (A–C)</option>
            </select>
          </div>
          <button
            type="button"
            onClick={handleBuild}
            disabled={loading}
            className="px-4 py-2 text-sm border border-border border-border-secondary rounded-lg dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary bg-background disabled:opacity-40 transition-colors"
          >
            {loading ? "Building..." : relayCount > 1 ? "Build relays" : "Build relay"}
          </button>
        </div>

        <div>
          <label className="text-xs text-foreground-secondary text-foreground-secondary mb-1 block">
            Athlete pool
          </label>
          <select
            value={signupPool}
            onChange={(e) => {
              setSignupPool(e.target.value as SignupPool)
              setResult(null)
            }}
            className="border border-border border-border-secondary rounded-lg px-3 py-2 text-sm bg-background border-border-secondary"
          >
            <option value="all">All athletes</option>
            <option value="meet">
              Signed up for this meet
              {meetSignedUpIds.length > 0
                ? ` (${meetSignedUpIds.length})`
                : ` (no ${genderPeople})`}
            </option>
            <option value="relay">
              Signed up for this relay
              {relaySignedUpIds.length > 0
                ? ` (${relaySignedUpIds.length})`
                : ` (no ${genderPeople})`}
            </option>
          </select>
          {poolCount != null && poolCount === 0 ? (
            <p className="mt-1 text-xs text-foreground-secondary text-foreground-secondary">
              {signupPool === "relay"
                ? `No ${genderPeople} signed up for this relay yet.`
                : `No ${genderPeople} signed up for this meet yet.`}
            </p>
          ) : null}
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        {result && result.teams.length > 0 && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium">
                {result.relay} — {result.course}
                {result.teams.length > 1
                  ? ` · ${result.teams.length} relays`
                  : ""}
              </h3>
              {!hasImportedResults && result.teams.length > 1 && (
                <button
                  type="button"
                  onClick={requestAddAll}
                  disabled={savingLetter != null}
                  className="px-3 py-1.5 text-sm border border-border border-border-secondary rounded-lg dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary bg-background disabled:opacity-40 transition-colors"
                >
                  {savingLetter === "*" ? "Adding…" : "Add all to roster summary"}
                </button>
              )}
            </div>

            {result.teams.map((team) => (
              <div key={team.letter} className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-zinc-200">
                      {team.letter} relay
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
                      className="px-3 py-1.5 text-sm border border-border border-border-secondary rounded-lg dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary bg-background disabled:opacity-40 transition-colors"
                    >
                      {savingLetter === team.letter
                        ? "Adding…"
                        : `Add ${team.letter} to roster summary`}
                    </button>
                  )}
                </div>

                <div className="border border-border border-border-secondary rounded-xl overflow-hidden divide-y">
                  {team.legs.map((leg, i) => (
                    <div
                      key={`${team.letter}-${i}`}
                      className="flex items-center justify-between px-4 py-3 bg-background bg-background"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center dark:bg-primary-hover dark:text-primary-text">
                          {i + 1}
                        </span>
                        <div>
                          <p className="text-sm font-medium">{leg.name}</p>
                          <p className="text-xs text-foreground-secondary text-foreground-secondary">
                            {leg.event}
                          </p>
                        </div>
                      </div>
                      <span className="font-mono text-sm">{formatTime(leg.timeMs)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {result.alternates && result.alternates.length > 0 && (
              <div>
                <h4 className="text-xs text-foreground-secondary text-foreground-secondary uppercase tracking-wide mb-2">
                  Alternates
                </h4>
                <div className="border border-border border-border-secondary rounded-xl overflow-hidden divide-y">
                  {result.alternates.map((alt, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between px-4 py-2 bg-background bg-background text-sm"
                    >
                      <span className="text-foreground-secondary text-foreground-secondary">{alt.name}</span>
                      <span className="font-mono text-foreground-secondary text-foreground-secondary">
                        {formatTime(alt.timeMs)}
                      </span>
                    </div>
                  ))}
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
              className="flex-1 rounded-lg border border-border border-border-secondary px-4 py-2.5 text-sm font-medium dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary dark:hover:bg-zinc-800 hover:dark:bg-background bg-fill-secondary border-border-secondary disabled:opacity-50"
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
    </section>
  )
}
