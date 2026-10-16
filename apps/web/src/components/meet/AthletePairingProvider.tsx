"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import { useImportTask } from "@/components/ui/ImportTaskProvider"

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
}

export type PairingRequest = {
  confirmations: NameConfirmation[]
  roster: RosterPairingOption[]
  description: string
  /** What one occurrence of a name is, singular and plural, e.g. ["result", "results"]. */
  occurrenceNoun: [string, string]
  /** Verb on the submit button, e.g. "Import" or "Save". */
  submitVerb: string
  /** Toast label while the paired import runs. */
  taskLabel: string
  /** Re-runs the import with the pairings; resolves to the toast's success summary. */
  submit: (nameMappings: Record<string, string>, rejectedNames: string[]) => Promise<string>
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

export default function AthletePairingProvider({ children }: { children: ReactNode }) {
  const { startTask } = useImportTask()
  const [queue, setQueue] = useState<QueuedRequest[]>([])
  const [blockers, setBlockers] = useState(0)

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

  function remove(id: number) {
    setQueue((prev) => prev.filter((r) => r.id !== id))
  }

  function skip() {
    if (!current) return
    remove(current.id)
    current.onSkip?.()
  }

  function select(pdfName: string, athleteId: string) {
    if (!current) return
    const id = current.id
    setQueue((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, selections: { ...r.selections, [pdfName]: athleteId } } : r
      )
    )
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
    startTask(
      request.taskLabel,
      request.submit(nameMappings, rejectedNames).catch((err: unknown) => {
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
        open={Boolean(current) && blockers === 0}
        onClose={skip}
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
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
            >
              {pairedCount > 0
                ? `${current?.submitVerb} ${pairedCount} paired`
                : `${current?.submitVerb} paired`}
            </button>
          </ModalFooter>
        }
      >
        {current ? (
          <ul className="space-y-3">
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
                  <label className="mt-3 block">
                    <span className="sr-only">Roster athlete for {c.pdfName}</span>
                    <select
                      value={current.selections[c.pdfName] ?? ""}
                      onChange={(e) => select(c.pdfName, e.target.value)}
                      className="w-full rounded-lg border border-border-secondary px-3 py-2 text-sm bg-background"
                    >
                      <option value="">Leave unmatched</option>
                      {current.roster.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.lastName}, {a.firstName}
                        </option>
                      ))}
                    </select>
                  </label>
                </li>
              )
            })}
          </ul>
        ) : null}
        {current?.error ? <p className="text-sm text-error">{current.error}</p> : null}
      </Modal>
    </AthletePairingContext.Provider>
  )
}
