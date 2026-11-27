"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import { useImportTask, type ImportTaskProgress } from "@/components/ui/ImportTaskProvider"
import AthletePairingSelect from "@/components/meet/AthletePairingSelect"
import AddAthleteDialog, { type AddedAthlete } from "@/components/athlete/AddAthleteDialog"

/** How long after the pairing dialog appears before clicking off it (or Escape) dismisses it. */
const DISMISS_GRACE_MS = 1500

/**
 * App-level host for the "Pair unmatched athletes" step after a results or sheet import.
 * It sits above the page so a refresh that re-lays-out the page (e.g. a meet getting its
 * first results) can't unmount the dialog while the coach is still pairing.
 */

export type NameConfirmation = {
  pdfName: string
  athleteId?: string
  athleteName?: string
  occurrences: number
}

export type RosterPairingOption = {
  id: string
  firstName: string
  lastName: string
  /** Set for "Search all seasons" athletes, to tag the ones from other seasons. */
  seasons?: string[]
}

export type PairingRequest = {
  confirmations: NameConfirmation[]
  roster: RosterPairingOption[]
  /**
   * The roster's season. When set, each dropdown can "Search all seasons" (an athlete paired from
   * another season is added to this one by the import) and create an athlete on this roster.
   */
  season?: string
  /**
   * `roster` is already every season's athletes (the season had no roster yet): no "Search all
   * seasons" row, and athletes from other seasons are tagged in the list.
   */
  allSeasons?: boolean
  description: string
  /** What one occurrence of a name is, singular and plural, e.g. ["result", "results"]. */
  occurrenceNoun: [string, string]
  /** Verb on the submit button, e.g. "Import" or "Save". */
  submitVerb: string
  /** Toast label while the paired import runs. */
  taskLabel: string
  /** Re-runs the import with the pairings; resolves to the toast's success summary. */
  submit: (
    nameMappings: Record<string, string>,
    rejectedNames: string[],
    /** Live progress for the toast's bar, when the import can report it. */
    report: (progress: ImportTaskProgress) => void
  ) => Promise<string>
  /** Runs when the coach skips, or submits with nothing paired. */
  onSkip?: () => void
}

type QueuedRequest = PairingRequest & {
  id: number
  /** Empty string = leave unmatched / skip. */
  selections: Record<string, string>
  error?: string
}

type AthletePairingContextValue = {
  requestPairing: (request: PairingRequest) => void
  /** Holds the dialog closed until the returned release is called. */
  block: () => () => void
}

const AthletePairingContext = createContext<AthletePairingContextValue | null>(null)

export function useAthletePairing() {
  const ctx = useContext(AthletePairingContext)
  if (!ctx) throw new Error("useAthletePairing must be used within AthletePairingProvider")
  return ctx
}

/** Keep the pairing dialog closed while `blocked` (e.g. another dialog is up). */
export function useBlockAthletePairing(blocked: boolean) {
  const { block } = useAthletePairing()
  useEffect(() => (blocked ? block() : undefined), [blocked, block])
}

let nextRequestId = 1

/** First and last name from a results name: "Page, Cole M" or "Cole Page". */
function splitResultName(name: string): { firstName: string; lastName: string } {
  const trimmed = name.trim().replace(/\s+/g, " ")
  if (trimmed.includes(",")) {
    const [last, ...rest] = trimmed.split(",")
    return { firstName: rest.join(" ").trim().split(" ")[0] ?? "", lastName: last.trim() }
  }
  const parts = trimmed.split(" ")
  if (parts.length < 2) return { firstName: trimmed, lastName: "" }
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") }
}

/** "Cole Page" for a results name like "Page, Cole M". */
function displayName(name: string): string {
  const { firstName, lastName } = splitResultName(name)
  return [firstName, lastName].filter(Boolean).join(" ")
}

type AthleteListRow = { id: string; firstName: string; lastName: string; seasons?: string[] }

const byName = (a: RosterPairingOption, b: RosterPairingOption) =>
  a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)

export default function AthletePairingProvider({ children }: { children: ReactNode }) {
  const { startTask } = useImportTask()
  const [queue, setQueue] = useState<QueuedRequest[]>([])
  const [blockers, setBlockers] = useState(0)
  /** Every athlete, all seasons — fetched the first time a dropdown asks, per batch of requests. */
  const [allAthletes, setAllAthletes] = useState<RosterPairingOption[] | null>(null)
  const [allAthletesError, setAllAthletesError] = useState<string | null>(null)
  const loadingAll = useRef(false)
  /** The name whose "Create athlete" dialog is open (the pairing dialog hides meanwhile). */
  const [creating, setCreating] = useState<string | null>(null)

  const loadAllAthletes = useCallback(() => {
    if (loadingAll.current) return
    loadingAll.current = true
    setAllAthletesError(null)
    fetch("/api/athletes")
      .then(async (res) => {
        if (!res.ok) throw new Error()
        const rows = (await res.json()) as AthleteListRow[]
        setAllAthletes(
          rows
            .map((a) => ({ id: a.id, firstName: a.firstName, lastName: a.lastName, seasons: a.seasons ?? [] }))
            .sort(byName)
        )
      })
      .catch(() => {
        loadingAll.current = false
        setAllAthletesError("Couldn't load athletes from other seasons")
      })
  }, [])

  const requestPairing = useCallback((request: PairingRequest) => {
    const selections: Record<string, string> = {}
    for (const c of request.confirmations) selections[c.pdfName] = c.athleteId ?? ""
    setQueue((prev) => [...prev, { ...request, id: nextRequestId++, selections }])
  }, [])

  const block = useCallback(() => {
    setBlockers((n) => n + 1)
    let released = false
    return () => {
      if (released) return
      released = true
      setBlockers((n) => n - 1)
    }
  }, [])

  const current = queue[0]
  const dialogOpen = Boolean(current) && blockers === 0 && creating === null

  // The dialog pops up on its own when an import finishes, often mid-click on the page
  // behind it — ignore backdrop clicks / Escape for a moment so that click doesn't skip
  // the whole batch. Skip still works immediately.
  const shownAt = useRef(0)
  useEffect(() => {
    if (dialogOpen) shownAt.current = Date.now()
  }, [dialogOpen, current?.id])

  function dismiss() {
    if (Date.now() - shownAt.current < DISMISS_GRACE_MS) return
    skip()
  }

  function remove(id: number) {
    setQueue((prev) => prev.filter((r) => r.id !== id))
    // Each batch of names reloads other seasons fresh (athletes may have changed since).
    setAllAthletes(null)
    loadingAll.current = false
  }

  function skip() {
    if (!current) return
    remove(current.id)
    current.onSkip?.()
  }

  function select(pdfName: string, athleteId: string) {
    if (!current) return
    const id = current.id
    // An athlete picked from another season joins the request's roster, so their name still shows
    // if the dialog comes back (a failed import) after the all-seasons list is dropped.
    const fromOtherSeason =
      athleteId && !current.roster.some((a) => a.id === athleteId)
        ? allAthletes?.find((a) => a.id === athleteId)
        : undefined
    setQueue((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              roster: fromOtherSeason ? [...r.roster, fromOtherSeason].sort(byName) : r.roster,
              selections: { ...r.selections, [pdfName]: athleteId },
            }
          : r
      )
    )
  }

  /** A newly created athlete joins the request's roster (they're on its season) and is paired. */
  function added(pdfName: string, athlete: AddedAthlete) {
    if (!current) return
    const id = current.id
    const option = { id: athlete.id, firstName: athlete.firstName, lastName: athlete.lastName, seasons: athlete.seasons }
    setQueue((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              roster: [...r.roster, option].sort(byName),
              selections: { ...r.selections, [pdfName]: athlete.id },
            }
          : r
      )
    )
    setAllAthletes((prev) => (prev ? [...prev, option].sort(byName) : prev))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const request = current
    if (!request) return

    const nameMappings: Record<string, string> = {}
    const rejectedNames: string[] = []
    for (const c of request.confirmations) {
      const selected = (request.selections[c.pdfName] ?? "").trim()
      if (selected) nameMappings[c.pdfName] = selected
      else rejectedNames.push(c.pdfName)
    }

    if (Object.keys(nameMappings).length === 0) {
      skip()
      return
    }

    remove(request.id)
    startTask(request.taskLabel, (report) =>
      request.submit(nameMappings, rejectedNames, report).catch((err: unknown) => {
        // Bring the dialog back with the coach's picks so a failed import doesn't lose them.
        const error = err instanceof Error ? err.message : "Import failed"
        setQueue((prev) => [{ ...request, error }, ...prev])
        throw err
      })
    )
  }

  const pairedCount = current
    ? current.confirmations.filter((c) => Boolean((current.selections[c.pdfName] ?? "").trim()))
        .length
    : 0

  return (
    <AthletePairingContext.Provider value={{ requestPairing, block }}>
      {children}
      <Modal
        open={dialogOpen}
        onClose={dismiss}
        title="Pair unmatched athletes"
        description={current?.description}
        onSubmit={handleSubmit}
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={skip}
              className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill"
            >
              Skip
            </button>
            <button
              type="submit"
              disabled={pairedCount === 0}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-contrast hover:bg-primary-hover disabled:opacity-50"
            >
              {pairedCount > 0
                ? `${current?.submitVerb} ${pairedCount} paired`
                : `${current?.submitVerb} paired`}
            </button>
          </ModalFooter>
        }
      >
        {current ? (
          // Keyed per request so each batch's dropdowns start on the season's roster.
          <ul key={current.id} className="space-y-3">
            {current.confirmations.map((c) => {
              const [singular, plural] = current.occurrenceNoun
              return (
                <li
                  key={c.pdfName}
                  className="rounded-xl border bg-fill-secondary px-4 py-3 border-border"
                >
                  <p className="text-sm text-foreground">
                    <strong>{c.pdfName}</strong>
                  </p>
                  <p className="mt-0.5 text-xs text-foreground-secondary">
                    {c.occurrences} {c.occurrences === 1 ? singular : plural} with this spelling
                    {c.athleteId && c.athleteName ? (
                      <span> · suggested match: {c.athleteName}</span>
                    ) : null}
                  </p>
                  <div className="mt-3">
                    <AthletePairingSelect
                      label={`Roster athlete for ${c.pdfName}`}
                      value={current.selections[c.pdfName] ?? ""}
                      roster={current.roster}
                      onChange={(athleteId) => select(c.pdfName, athleteId)}
                      season={current.season}
                      allSeasons={
                        current.season && !current.allSeasons
                          ? { athletes: allAthletes, load: loadAllAthletes }
                          : undefined
                      }
                      tagOtherSeasons={current.allSeasons}
                      createLabel={
                        current.season ? `Create athlete “${displayName(c.pdfName)}”…` : undefined
                      }
                      onCreate={current.season ? () => setCreating(c.pdfName) : undefined}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        ) : null}
        {allAthletesError ? <p className="text-sm text-error">{allAthletesError}</p> : null}
        {current?.error ? <p className="text-sm text-error">{current.error}</p> : null}
      </Modal>
      {current?.season ? (
        <AddAthleteDialog
          open={creating !== null && blockers === 0}
          onClose={() => setCreating(null)}
          season={current.season}
          initial={creating !== null ? splitResultName(creating) : undefined}
          onAdded={(athlete) => {
            if (creating !== null) added(creating, athlete)
          }}
        />
      ) : null}
    </AthletePairingContext.Provider>
  )
}
