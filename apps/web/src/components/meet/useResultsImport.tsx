"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import { useScraperUi } from "@/components/scraper/ScraperUiProvider"
import { useImportTask } from "@/components/ui/ImportTaskProvider"

/** Meet results import (SwimPhone scrape or results PDF) plus the athlete-pairing step. */

export type ResultsImportSource =
  | { kind: "pdf"; pdfUrl?: string; file?: File | null }
  | { kind: "swimphone"; url: string }

type NameConfirmation = {
  pdfName: string
  athleteId?: string
  athleteName?: string
  occurrences: number
}

type RosterPairingOption = {
  id: string
  firstName: string
  lastName: string
}

type ImportResult = {
  imported: number
  parsed: number
  matched: number
  unmatchedCount: number
  unmatched: { name: string; event: string; time: string }[]
  meetName?: string
  meetDate?: string
  captchaLimited?: boolean
  incompleteRelays?: string[]
  leadoffsImported?: number
  nameConfirmations?: NameConfirmation[]
  rosterForPairing?: RosterPairingOption[]
  cachedParse?: unknown
}

type ImportRun = {
  source: ResultsImportSource
  team: string
  course: string
  cachedParse?: unknown
}

function buildImportSummary(data: ImportResult): string {
  let summary = `Imported ${data.imported} new swim${data.imported === 1 ? "" : "s"}`
  if (data.unmatchedCount > 0) {
    summary += ` (${data.unmatchedCount} unmatched)`
  }
  return summary
}

export function useResultsImport({
  meetId,
  season,
  pairingBlocked = false,
}: {
  meetId?: string
  season: string
  /** Hold the pairing dialog closed while another dialog is up; it opens once this clears. */
  pairingBlocked?: boolean
}) {
  const router = useRouter()
  const { requireScraper } = useScraperUi()
  const { startTask } = useImportTask()

  const runRef = useRef<ImportRun | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingConfirmations, setPendingConfirmations] = useState<NameConfirmation[]>([])
  const [rosterOptions, setRosterOptions] = useState<RosterPairingOption[]>([])
  /** Empty string = leave unmatched / skip. */
  const [pairSelections, setPairSelections] = useState<Record<string, string>>({})

  function resetPairing() {
    setConfirmOpen(false)
    setPendingConfirmations([])
    setRosterOptions([])
    setPairSelections({})
  }

  async function runPdfImport(
    run: ImportRun,
    opts?: { nameMappings?: Record<string, string>; rejectedNames?: string[]; cachedParse?: unknown }
  ) {
    const source = run.source as Extract<ResultsImportSource, { kind: "pdf" }>
    const pdfUrl = source.pdfUrl?.trim() ?? ""
    if (!opts?.cachedParse && !source.file && !pdfUrl) {
      throw new Error("Choose a PDF file or enter a PDF URL")
    }

    const body = new FormData()
    if (!opts?.cachedParse) {
      if (pdfUrl) body.append("pdfUrl", pdfUrl)
      else if (source.file) body.append("file", source.file, source.file.name)
    }
    body.append("course", run.course)
    body.append("team", run.team.trim())
    body.append("season", season)
    if (meetId) body.append("meetId", meetId)
    if (opts?.nameMappings) body.append("nameMappings", JSON.stringify(opts.nameMappings))
    if (opts?.rejectedNames?.length) body.append("rejectedNames", JSON.stringify(opts.rejectedNames))
    if (opts?.cachedParse) body.append("cachedParse", JSON.stringify(opts.cachedParse))

    const res = await fetch("/api/meets/import", { method: "POST", body })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? "Import failed")
    if (data.jobId) {
      const { pollScraperJob } = await import("@/lib/scraper/scraper-job-client")
      await pollScraperJob(data.jobId)
      const fin = await fetch("/api/meets/import/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: data.jobId }),
      })
      const finalized = await fin.json()
      if (!fin.ok) throw new Error(finalized.error ?? "Import failed")
      return finalized as ImportResult
    }
    return data as ImportResult
  }

  async function runSwimphoneImport(
    run: ImportRun,
    opts?: { nameMappings?: Record<string, string>; rejectedNames?: string[] }
  ) {
    const source = run.source as Extract<ResultsImportSource, { kind: "swimphone" }>
    const url = source.url.trim()
    if (!url) throw new Error("Paste a SwimPhone meet URL")

    const res = await fetch("/api/meets/import/swimphone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        season,
        meetId,
        team: run.team.trim(),
        nameMappings: opts?.nameMappings,
        rejectedNames: opts?.rejectedNames,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? "Import failed")
    if (data.jobId) {
      const { pollScraperJob } = await import("@/lib/scraper/scraper-job-client")
      await pollScraperJob(data.jobId)
      const fin = await fetch("/api/meets/import/swimphone/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: data.jobId }),
      })
      const finalized = await fin.json()
      if (!fin.ok) throw new Error(finalized.error ?? "Import failed")
      return finalized as ImportResult
    }
    return data as ImportResult
  }

  function handleImportResponse(run: ImportRun, data: ImportResult): string {
    const confirmations = data.nameConfirmations ?? []
    if (confirmations.length > 0) {
      run.cachedParse = data.cachedParse
      const selections: Record<string, string> = {}
      for (const c of confirmations) selections[c.pdfName] = c.athleteId ?? ""
      setPendingConfirmations(confirmations)
      setRosterOptions(data.rosterForPairing ?? [])
      setPairSelections(selections)
      setConfirmOpen(true)
    } else {
      resetPairing()
    }
    router.refresh()
    return buildImportSummary(data)
  }

  /**
   * Run an import in the background task toast. `before` runs first (e.g. saving the
   * meet's other resources); SwimPhone imports wait for the desktop scraper.
   */
  function startImport(
    source: ResultsImportSource,
    {
      team,
      course,
      before,
      onStart,
      onSettled,
    }: {
      team: string
      course: string
      before?: () => Promise<unknown>
      /** Called once the import actually begins (after the scraper check). */
      onStart?: () => void
      onSettled?: (ok: boolean) => void
    }
  ) {
    const run: ImportRun = { source, team, course }
    runRef.current = run
    const swimphone = source.kind === "swimphone"
    const go = () => {
      onStart?.()
      const importPromise = Promise.resolve(before?.())
        .then(() => (swimphone ? runSwimphoneImport(run) : runPdfImport(run)))
        .then((data) => handleImportResponse(run, data))
      importPromise.then(
        () => onSettled?.(true),
        () => onSettled?.(false)
      )
      startTask(swimphone ? "Scraping meet…" : "Importing results…", importPromise)
    }
    if (swimphone) requireScraper(go)
    else go()
  }

  function closeWithoutPairing() {
    resetPairing()
    router.refresh()
  }

  function handleConfirmSubmit(e: React.FormEvent) {
    e.preventDefault()
    const run = runRef.current
    if (!run) return

    const nameMappings: Record<string, string> = {}
    const rejectedNames: string[] = []
    for (const c of pendingConfirmations) {
      const selected = (pairSelections[c.pdfName] ?? "").trim()
      if (selected) nameMappings[c.pdfName] = selected
      else rejectedNames.push(c.pdfName)
    }

    if (Object.keys(nameMappings).length === 0) {
      closeWithoutPairing()
      return
    }

    setConfirmOpen(false)
    const importPromise =
      run.source.kind === "pdf"
        ? runPdfImport(run, { nameMappings, rejectedNames, cachedParse: run.cachedParse })
        : runSwimphoneImport(run, { nameMappings, rejectedNames })

    startTask(
      "Importing paired results…",
      importPromise.then((data) => {
        resetPairing()
        router.refresh()
        return buildImportSummary(data)
      })
    )
  }

  const pairedCount = pendingConfirmations.filter((c) =>
    Boolean((pairSelections[c.pdfName] ?? "").trim())
  ).length

  const pairingModal = (
    <Modal
      open={confirmOpen && !pairingBlocked}
      onClose={closeWithoutPairing}
      title="Pair unmatched athletes"
      description="These names matched your team code but not the roster. Pair them to a roster athlete to import their results."
      onSubmit={handleConfirmSubmit}
      footer={
        <ModalFooter>
          <button
            type="button"
            onClick={closeWithoutPairing}
            className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill"
          >
            Skip
          </button>
          <button
            type="submit"
            disabled={pairedCount === 0}
            className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
          >
            {pairedCount > 0 ? `Import ${pairedCount} paired` : "Import paired"}
          </button>
        </ModalFooter>
      }
    >
      <ul className="space-y-3">
        {pendingConfirmations.map((c) => {
          const selected = pairSelections[c.pdfName] ?? ""
          const suggested =
            c.athleteId && c.athleteName ? { id: c.athleteId, name: c.athleteName } : null
          return (
            <li key={c.pdfName} className="rounded-xl border bg-fill-secondary px-4 py-3 border-border">
              <p className="text-sm text-foreground">
                <strong>{c.pdfName}</strong>
              </p>
              <p className="mt-0.5 text-xs text-foreground-secondary">
                {c.occurrences} result{c.occurrences === 1 ? "" : "s"} with this spelling
                {suggested ? <span> · suggested match: {suggested.name}</span> : null}
              </p>
              <label className="mt-3 block">
                <span className="sr-only">Roster athlete for {c.pdfName}</span>
                <select
                  value={selected}
                  onChange={(e) =>
                    setPairSelections((prev) => ({ ...prev, [c.pdfName]: e.target.value }))
                  }
                  className="w-full rounded-lg border border-border-secondary px-3 py-2 text-sm bg-background"
                >
                  <option value="">Leave unmatched</option>
                  {rosterOptions.map((a) => (
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
    </Modal>
  )

  return { startImport, pairingModal }
}
