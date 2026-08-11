"use client"

import { useEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import DontReloadNotice from "@/components/DontReloadNotice"
import { useDontReloadWhileBusy } from "@/lib/use-dont-reload"
import type { SheetEntry } from "@/lib/meet-sheet-summary"
import { normalizeEventName } from "@/lib/swim-parse"
import { formatDisplayTime, formatSeedTimeDelta, formatOrdinal, podiumPlaceClass } from "@/lib/utils"
import {
  displayRelayLetter,
  effectiveRelayGender,
  effectiveRelayRound,
  relayEventKey,
  relayTeamPlace,
  relayTeamTime,
  relaySwimmerFullName,
  sanitizeRelaySplitTime,
  type RelayGender,
  type RelayRound,
} from "@/lib/relay-results"

const RELAY_EVENTS = [
  "200 Medley Relay",
  "200 Free Relay",
  "400 Free Relay",
  "800 Free Relay",
  "400 Medley Relay",
]

const RELAY_LETTERS = ["A", "B", "C", "D"]

const RELAY_ROUNDS: Array<{ value: RelayRound; label: string }> = [
  { value: "", label: "Timed final" },
  { value: "P", label: "Prelims" },
  { value: "F", label: "Finals" },
]

const RELAY_GENDERS: Array<{ value: RelayGender; label: string }> = [
  { value: "F", label: "Women's" },
  { value: "M", label: "Men's" },
  { value: "X", label: "Mixed" },
]

type AthleteOption = { id: string; name: string; gender?: RelayGender }

type RelayForm = {
  event: string
  relayLetter: string
  relayRound: RelayRound
  gender: RelayGender
  legs: [string, string, string, string]
  legSplits: [string, string, string, string]
  resultTime: string
  resultPlace: string
}

function emptyForm(): RelayForm {
  return {
    event: RELAY_EVENTS[0],
    relayLetter: "A",
    relayRound: "",
    gender: "F",
    legs: ["", "", "", ""],
    legSplits: ["", "", "", ""],
    resultTime: "",
    resultPlace: "",
  }
}

function formFromEntry(
  entry: SheetEntry,
  athleteGenders?: Map<string, RelayGender>
): RelayForm {
  const sorted = [...(entry.relaySwimmers ?? [])].sort((a, b) => a.leg - b.leg)
  const legs: [string, string, string, string] = [1, 2, 3, 4].map((legNum) => {
    const leg = sorted.find((s) => s.leg === legNum)
    return leg?.athleteId ?? ""
  }) as [string, string, string, string]
  const legSplits: [string, string, string, string] = [1, 2, 3, 4].map((legNum) => {
    const leg = sorted.find((s) => s.leg === legNum)
    return sanitizeRelaySplitTime(leg?.splitTime) ?? ""
  }) as [string, string, string, string]

  const place = relayTeamPlace(entry)

  return {
    event: relayEventKey(entry.event) || normalizeEventName(entry.event),
    relayLetter: entry.relayLetter ?? "A",
    relayRound: effectiveRelayRound(entry),
    gender: effectiveRelayGender(entry, athleteGenders) || "F",
    legs,
    legSplits,
    resultTime: relayTeamTime(entry) ?? "",
    resultPlace: place != null && place > 0 ? String(place) : "",
  }
}

function roundLabel(round: RelayRound): string {
  if (round === "P") return "Prelims"
  if (round === "F") return "Finals"
  return "Timed final"
}

function athletesForRelayGender(
  athletes: AthleteOption[],
  relayGender: RelayGender
): AthleteOption[] {
  if (relayGender === "F") return athletes.filter((a) => a.gender === "F")
  if (relayGender === "M") return athletes.filter((a) => a.gender === "M")
  return athletes
}

/** Filter by relay gender; keep any already-selected swimmers visible in their leg. */
function relayAthleteOptions(
  athletes: AthleteOption[],
  relayGender: RelayGender,
  selectedIds: string[]
): AthleteOption[] {
  const filtered = athletesForRelayGender(athletes, relayGender)
  const byId = new Map(filtered.map((a) => [a.id, a]))
  for (const id of selectedIds) {
    if (!id || byId.has(id)) continue
    const selected = athletes.find((a) => a.id === id)
    if (selected) byId.set(id, selected)
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function RelayModal({
  meetId,
  athletes,
  title,
  initial,
  onClose,
  allowDelete,
  deleteParams,
  rosterOnly = false,
}: {
  meetId: string
  athletes: AthleteOption[]
  title: string
  initial: RelayForm
  onClose: () => void
  allowDelete?: boolean
  deleteParams?: {
    event: string
    relayLetter: string | null
    relayRound: RelayRound
    gender: RelayGender
  }
  rosterOnly?: boolean
}) {
  const router = useRouter()
  const [form, setForm] = useState(initial)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])
  useDontReloadWhileBusy(loading)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const swimmerOptions = relayAthleteOptions(athletes, form.gender, form.legs)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (new Set(form.legs).size !== 4) {
      setError("Pick four different swimmers")
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/meets/${meetId}/relays`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: form.event,
          relayLetter: form.relayLetter || null,
          relayRound: form.relayRound,
          gender: form.gender,
          legs: form.legs.map((athleteId, i) => ({
            leg: i + 1,
            athleteId,
            splitTime: form.legSplits[i]?.trim() || undefined,
          })),
          resultTime: form.resultTime || undefined,
          resultPlace: form.resultPlace.trim() || undefined,
          rosterOnly,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Failed to save relay")
        return
      }
      onClose()
      router.refresh()
    } catch {
      setError("Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!deleteParams || !confirm("Remove this relay from saved results?")) return
    setLoading(true)
    setError(null)
    try {
      const q = new URLSearchParams({ event: deleteParams.event })
      if (deleteParams.relayLetter) q.set("relayLetter", deleteParams.relayLetter)
      if (deleteParams.relayRound) q.set("relayRound", deleteParams.relayRound)
      if (deleteParams.gender) q.set("gender", deleteParams.gender)
      const res = await fetch(`/api/meets/${meetId}/relays?${q}`, {
        method: "DELETE",
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Failed to delete relay")
        return
      }
      onClose()
      router.refresh()
    } catch {
      setError("Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => !loading && onClose()}
        aria-label="Close dialog"
      />
      <div
        className="relative z-10 flex w-full max-w-md max-h-[90vh] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-6 pt-6 pb-2">
          <h2 className="text-lg font-medium text-foreground">{title}</h2>
          {rosterOnly ? (
            <p className="mt-1 text-sm text-foreground-secondary">
              Update swimmers and leg splits — event, time, and place stay from the import.
            </p>
          ) : null}
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {!rosterOnly ? (
            <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground-secondary mb-1">
                Event
              </label>
              <select
                value={form.event}
                onChange={(e) => {
                  setForm((f) => ({ ...f, event: e.target.value }))
                }}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background"
              >
                {RELAY_EVENTS.map((event) => (
                  <option key={event}>{event}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-secondary mb-1">
                Team
              </label>
              <select
                value={form.relayLetter}
                onChange={(e) =>
                  setForm((f) => ({ ...f, relayLetter: e.target.value }))
                }
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background"
              >
                {RELAY_LETTERS.map((letter) => (
                  <option key={letter} value={letter}>
                    Relay {letter}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground-secondary mb-1">
                Round
              </label>
              <select
                value={form.relayRound}
                onChange={(e) =>
                  setForm((f) => ({ ...f, relayRound: e.target.value as RelayRound }))
                }
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background"
              >
                {RELAY_ROUNDS.map(({ value, label }) => (
                  <option key={value || "timed"} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-secondary mb-1">
                Gender
              </label>
              <select
                value={form.gender}
                onChange={(e) => {
                  const gender = e.target.value as RelayGender
                  const genderAllowed = new Set(
                    athletesForRelayGender(athletes, gender).map((a) => a.id)
                  )
                  setForm((f) => ({
                    ...f,
                    gender,
                    legs: f.legs.map((id) =>
                      id && genderAllowed.has(id) ? id : ""
                    ) as RelayForm["legs"],
                  }))
                }}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background"
              >
                {RELAY_GENDERS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
            </>
          ) : null}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-medium text-foreground-secondary">
                <span className="w-6 shrink-0">#</span>
                <span className="flex-1">Swimmer</span>
                <span className="w-24 shrink-0 text-right">Split</span>
              </div>
            </div>
            {form.legs.map((athleteId, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-6 text-xs text-foreground-tertiary dark:text-foreground-tertiary shrink-0">
                  {i + 1}
                </span>
                <select
                  required
                  value={athleteId}
                  onChange={(e) => {
                    const legs = [...form.legs] as [string, string, string, string]
                    legs[i] = e.target.value
                    setForm((f) => ({ ...f, legs }))
                  }}
                  className="flex-1 rounded-lg border border-border px-3 py-2 text-sm bg-background"
                >
                  <option value="">Select swimmer…</option>
                  {swimmerOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="1:23.45"
                  value={form.legSplits[i]}
                  onChange={(e) => {
                    const legSplits = [...form.legSplits] as [
                      string,
                      string,
                      string,
                      string,
                    ]
                    legSplits[i] = e.target.value
                    setForm((f) => ({ ...f, legSplits }))
                  }}
                  className="w-24 rounded-lg border border-border px-2 py-2 text-sm font-mono bg-background"
                />
              </div>
            ))}
          </div>

          {!rosterOnly ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground-secondary mb-1">
                Time
              </label>
              <input
                type="text"
                placeholder="1:23.45"
                value={form.resultTime}
                onChange={(e) =>
                  setForm((f) => ({ ...f, resultTime: e.target.value }))
                }
                className="w-full rounded-lg border border-border px-3 py-2 text-sm font-mono bg-background"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-secondary mb-1">
                Place
              </label>
              <input
                type="number"
                min={1}
                placeholder="1"
                value={form.resultPlace}
                onChange={(e) =>
                  setForm((f) => ({ ...f, resultPlace: e.target.value }))
                }
                className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background"
              />
            </div>
          </div>
          ) : null}

          {error && (
            <p className="text-sm text-error">{error}</p>
          )}
          </div>

          {loading ? (
            <div className="shrink-0 px-6 pb-1">
              <DontReloadNotice />
            </div>
          ) : null}

          <div className="shrink-0 flex gap-3 border-t border-border-secondary px-6 py-4">
            {allowDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={loading}
                className="rounded-lg border border-border border-red-200 px-4 py-2.5 text-sm font-medium text-error hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/30 disabled:opacity-50"
              >
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium bg-background hover:bg-fill"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || form.legs.some((id) => !id)}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? "Saving…" : rosterOnly ? "Save roster" : "Save relay"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}

export function RelayDetailModal({
  entry,
  title,
  timeDisplay,
  coachNote,
  onClose,
  swimInfo,
  rawTime,
}: {
  entry: SheetEntry
  title: string
  timeDisplay?: ReactNode
  coachNote?: string
  onClose: () => void
    swimInfo?: {
    seedTime?: string
    rank?: number | string
    heat?: number | string
    lane?: number
    resultPlace?: number
    time?: string
    rawTime?: string
  }
  rawTime?: string
}) {
  const [mounted, setMounted] = useState(false)
  const swimmers = [...(entry.relaySwimmers ?? [])].sort((a, b) => a.leg - b.leg)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close dialog"
      />
      <div
        className="relative z-10 flex w-full max-w-md max-h-[90vh] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-6 pt-6 pb-2">
          <h2 className="text-lg font-medium text-foreground">{title}</h2>
          {(rawTime || timeDisplay) ? (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-foreground font-mono text-lg">{rawTime ?? timeDisplay}</span>
              {(() => {
                const delta = swimInfo?.seedTime && rawTime ? formatSeedTimeDelta(swimInfo.seedTime, rawTime) : null;
                if (!delta) return null;
                const isDrop = delta.startsWith("-");
                return (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-mono font-medium ${
                    isDrop 
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300"
                      : "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300"
                  }`}>
                    {delta}
                  </span>
                );
              })()}
              {swimInfo?.resultPlace && (
                <span className={swimInfo.resultPlace >= 1 && swimInfo.resultPlace <= 3 ? `font-medium ${podiumPlaceClass(swimInfo.resultPlace)}` : "text-foreground text-opacity-70 dark:text-foreground dark:text-opacity-70 font-medium"}>
                  {formatOrdinal(swimInfo.resultPlace)}
                </span>
              )}
            </div>
          ) : null}
          {swimInfo && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground-secondary">
              {swimInfo.seedTime && (
                <span className="flex items-center gap-1.5">
                  <span className="text-foreground-tertiary">Seed:</span>
                  {swimInfo.seedTime}
                  {swimInfo.rank && ` #${swimInfo.rank}`}
                </span>
              )}
              {swimInfo.heat && <span className="flex items-center gap-1.5"><span className="text-foreground-tertiary">Heat</span> {swimInfo.heat}</span>}
              {swimInfo.lane != null && <span className="flex items-center gap-1.5"><span className="text-foreground-tertiary">Lane</span> {swimInfo.lane}</span>}
            </div>
          )}
          {coachNote ? (
            <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">{coachNote}</p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <ul className="divide-y divide-border border border-border rounded-lg overflow-hidden">
          <li className="grid grid-cols-[2rem_1fr_auto] gap-2 px-3 py-2 text-xs font-medium uppercase tracking-wide text-foreground-tertiary dark:text-foreground-tertiary dark:bg-background bg-fill-secondary/50">
            <span>#</span>
            <span>Swimmer</span>
            <span className="min-w-[5.5rem] text-right">Split</span>
          </li>
          {swimmers.map((swimmer) => {
            const split = sanitizeRelaySplitTime(swimmer.splitTime)
            const nestedTimes =
              swimmer.splits
                ?.slice()
                .sort((a, b) => a.distance - b.distance)
                .map((s) => sanitizeRelaySplitTime(s.splitTime))
                .filter((t): t is string => Boolean(t)) ?? []
            const showNested = nestedTimes.length > 1
            return (
              <li
                key={swimmer.leg}
                className="grid grid-cols-[2rem_1fr_auto] gap-2 px-3 py-2.5 text-sm items-center"
              >
                <span className="text-foreground-tertiary dark:text-foreground-tertiary">
                  {swimmer.leg}
                </span>
                <span className="truncate text-foreground dark:text-foreground">
                  {relaySwimmerFullName(swimmer.name) ?? ""}
                </span>
                <span className="min-w-[5.5rem] text-right">
                  <span className="block font-mono text-foreground">
                    {split ? formatDisplayTime(split) : ""}
                  </span>
                  {showNested ? (
                    <span className="block font-mono text-xs text-foreground-tertiary">
                      {nestedTimes.map((t) => formatDisplayTime(t)).join(" · ")}
                    </span>
                  ) : null}
                </span>
              </li>
            )
          })}
        </ul>
        </div>

        <div className="shrink-0 border-t border-border-secondary px-6 py-4">
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-lg border border-border px-4 py-2.5 text-sm font-medium bg-background hover:bg-fill"
        >
          Close
        </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export function AddMeetRelayButton({
  meetId,
  athletes,
}: {
  meetId: string
  athletes: AthleteOption[]
}) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={athletes.length < 4}
        className="text-xs px-3 py-1.5 border border-border rounded-lg bg-background hover:bg-fill disabled:opacity-40 transition-colors"
      >
        Add relay
      </button>
    )
  }

  return (
    <RelayModal
      meetId={meetId}
      athletes={athletes}
      title="Add relay"
      initial={emptyForm()}
      onClose={() => setOpen(false)}
    />
  )
}

export function EditRelayButton({
  meetId,
  athletes,
  entry,
  className,
}: {
  meetId: string
  athletes: AthleteOption[]
  entry: SheetEntry
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const rosterOnly = !entry.manual
  const round = effectiveRelayRound(entry)
  const athleteGenders = new Map(
    athletes
      .filter((a): a is AthleteOption & { gender: RelayGender } => a.gender === "M" || a.gender === "F")
      .map((a) => [a.id, a.gender])
  )
  const gender = effectiveRelayGender(entry, athleteGenders) || "F"
  const roundSuffix = round ? ` · ${roundLabel(round)}` : ""
  const genderLabel = gender === "F" ? "Women's" : gender === "M" ? "Men's" : gender === "X" ? "Mixed" : "";
  const eventNum = entry.eventNumber > 0 ? `#${entry.eventNumber} ` : ""
  const baseTitle = `${eventNum}${genderLabel} ${entry.event} ${displayRelayLetter(entry.relayLetter)}`

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
          className={
          className ??
          "p-1 rounded text-foreground-tertiary hover:text-foreground hover:bg-fill disabled:opacity-50 transition-colors"
        }
        aria-label={rosterOnly ? "Edit relay roster" : "Edit relay"}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-4 h-4"
          aria-hidden="true"
        >
          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
        </svg>
      </button>
      {open ? (
        <RelayModal
          meetId={meetId}
          athletes={athletes}
          title={
            rosterOnly
              ? `Edit roster · ${baseTitle}${roundSuffix}`
              : `Edit ${baseTitle}${roundSuffix}`
          }
          initial={formFromEntry(entry, athleteGenders)}
          onClose={() => setOpen(false)}
          allowDelete={entry.manual === true}
          rosterOnly={rosterOnly}
          deleteParams={{
            event: relayEventKey(entry.event) || normalizeEventName(entry.event),
            relayLetter: entry.relayLetter ?? null,
            relayRound: round,
            gender,
          }}
        />
      ) : null}
    </>
  )
}
