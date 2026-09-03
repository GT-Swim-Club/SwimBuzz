"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { currentSeason, parseSeason } from "@/lib/season"
import Modal, { ModalFooter } from "@/components/Modal"
import { useScraperUi } from "@/components/ScraperUiProvider"
import { useImportTask } from "@/components/ImportTaskProvider"
import { FileDropzone, FileDropzoneContent, fileDropzoneSurfaceClassName } from "@/components/FileDropzone"

type ImportSource = "pdf" | "swimphone"

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

type CachedImportData = {
  cachedParse?: unknown
}

function buildImportSummary(data: ImportResult): string {
  let summary = `Imported ${data.imported} new swim${data.imported === 1 ? "" : "s"}`
  if (data.unmatchedCount > 0) {
    summary += ` (${data.unmatchedCount} unmatched)`
  }
  return summary
}

export default function ImportMeetButton({
  meetId,
  season: seasonProp,
  resultsUrl: initialResultsUrl = "",
  swimphoneUrl: initialSwimphoneUrl = "",
}: {
  meetId?: string
  season?: string
  resultsUrl?: string
  swimphoneUrl?: string
} = {}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const season =
    seasonProp ??
    parseSeason(searchParams.get("season") ?? searchParams.get("year")) ??
    currentSeason()

  const { requireScraper } = useScraperUi()
  const { startTask } = useImportTask()

  const [open, setOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [source, setSource] = useState<ImportSource>("pdf")
  const [error, setError] = useState<string | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [mode, setMode] = useState<"url" | "file">(initialResultsUrl ? "url" : "file")
  const [resultsPdfUrl, setResultsPdfUrl] = useState(initialResultsUrl)
  const [swimphoneUrl, setSwimphoneUrl] = useState(initialSwimphoneUrl)
  const [team, setTeam] = useState("GTSC")
  const [course, setCourse] = useState("SCY")
  const [pendingConfirmations, setPendingConfirmations] = useState<NameConfirmation[]>([])
  const [rosterOptions, setRosterOptions] = useState<RosterPairingOption[]>([])
  /** Empty string = leave unmatched / skip. */
  const [pairSelections, setPairSelections] = useState<Record<string, string>>({})
  const [cachedImportData, setCachedImportData] = useState<CachedImportData | null>(null)

  function resetFormState() {
    setError(null)
    setConfirmError(null)
    setPendingConfirmations([])
    setRosterOptions([])
    setPairSelections({})
    setCachedImportData(null)
  }

  function finishImportCleanup() {
    setOpen(false)
    setConfirmOpen(false)
    setPendingConfirmations([])
    setRosterOptions([])
    setPairSelections({})
    setCachedImportData(null)
    router.refresh()
  }


  function handleFileChange(file: File | null) {
    setSelectedFile(file)
    setResultsPdfUrl("")
    setError(null)
  }

  function defaultPairSelections(confirmations: NameConfirmation[]): Record<string, string> {
    const next: Record<string, string> = {}
    for (const c of confirmations) {
      next[c.pdfName] = c.athleteId ?? ""
    }
    return next
  }

  function handleImportResponse(data: ImportResult): string {
    const confirmations = data.nameConfirmations ?? []
    if (confirmations.length > 0) {
      if (data.cachedParse) {
        setCachedImportData({ cachedParse: data.cachedParse })
      }
      setOpen(false)
      setPendingConfirmations(confirmations)
      setRosterOptions(data.rosterForPairing ?? [])
      setPairSelections(defaultPairSelections(confirmations))
      setConfirmError(null)
      setConfirmOpen(true)
      router.refresh()
      return buildImportSummary(data)
    }

    finishImportCleanup()
    return buildImportSummary(data)
  }

  async function runPdfImport(opts?: {
    nameMappings?: Record<string, string>
    rejectedNames?: string[]
    cachedParse?: unknown
  }) {
    const pdfUrl = resultsPdfUrl.trim()
    if (!opts?.cachedParse && !selectedFile && !pdfUrl) {
      throw new Error(mode === "url" ? "Enter a PDF URL" : "Choose a PDF file first")
    }

    const body = new FormData()
    if (!opts?.cachedParse) {
      if (mode === "url" && pdfUrl) {
        body.append("pdfUrl", pdfUrl)
      } else if (selectedFile) {
        body.append("file", selectedFile, selectedFile.name)
      }
    }
    body.append("course", course)
    body.append("team", team.trim())
    body.append("season", season)
    if (meetId) body.append("meetId", meetId)
    if (opts?.nameMappings) {
      body.append("nameMappings", JSON.stringify(opts.nameMappings))
    }
    if (opts?.rejectedNames?.length) {
      body.append("rejectedNames", JSON.stringify(opts.rejectedNames))
    }
    if (opts?.cachedParse) {
      body.append("cachedParse", JSON.stringify(opts.cachedParse))
    }

    const res = await fetch("/api/meets/import", { method: "POST", body })
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error ?? "Import failed")
    }
    if (data.jobId) {
      const { pollScraperJob } = await import("@/lib/scraper-job-client")
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

  async function runSwimphoneImport(opts?: {
    nameMappings?: Record<string, string>
    rejectedNames?: string[]
  }) {
    const trimmed = swimphoneUrl.trim()
    if (!trimmed) {
      throw new Error("Paste a SwimPhone meet URL")
    }

    const res = await fetch("/api/meets/import/swimphone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: trimmed,
        season,
        meetId,
        team: team.trim(),
        nameMappings: opts?.nameMappings,
        rejectedNames: opts?.rejectedNames,
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error ?? "Import failed")
    }
    if (data.jobId) {
      const { pollScraperJob } = await import("@/lib/scraper-job-client")
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

  async function patchMeetResources(resources: { resultsUrl?: string; swimphoneUrl?: string }) {
    if (!meetId) return
    const res = await fetch("/api/meets/" + meetId, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(resources),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? "Failed to save meet resources")
  }
  async function saveResultsPdfResource() {
    if (!meetId) return
    let nextResultsUrl = resultsPdfUrl.trim()
    if (selectedFile) {
      const body = new FormData()
      body.append("file", selectedFile, selectedFile.name)
      const res = await fetch("/api/meets/upload", { method: "POST", body })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error ?? "Failed to upload Results PDF")
      nextResultsUrl = data.url
      setResultsPdfUrl(nextResultsUrl)
      setSelectedFile(null)
      setMode("url")
    }
    await patchMeetResources({ resultsUrl: nextResultsUrl })
  }
  async function saveSwimphoneResource() {
    await patchMeetResources({ swimphoneUrl: swimphoneUrl.trim() })
  }
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!team.trim()) {
      setError("Team code is required")
      return
    }
    const hasSwimphone = Boolean(swimphoneUrl.trim())
    const hasResultsPdf = Boolean(resultsPdfUrl.trim() || selectedFile)
    if (!hasSwimphone && !hasResultsPdf) {
      setError("Add a SwimPhone URL or Results PDF")
      return
    }
    setError(null)
    const importSource: ImportSource = hasSwimphone ? "swimphone" : "pdf"
    setSource(importSource)
    function startImport() {
      const importPromise = (importSource === "swimphone"
        ? saveResultsPdfResource()
        : saveSwimphoneResource()
      ).then(() =>
        importSource === "swimphone" ? runSwimphoneImport() : runPdfImport()
      )
      startTask(
        importSource === "swimphone" ? "Scraping meet…" : "Importing results…",
        importPromise.then((data) => handleImportResponse(data))
      )
    }
    if (importSource === "swimphone") {
      requireScraper(startImport)
    } else {
      startImport()
    }
    setOpen(false)
    resetFormState()
  }

  function closeConfirmWithoutPairing() {
    setConfirmOpen(false)
    setPendingConfirmations([])
    setRosterOptions([])
    setPairSelections({})
    setConfirmError(null)
    router.refresh()
  }

  function handleConfirmSubmit(e: React.FormEvent) {
    e.preventDefault()

    const nameMappings: Record<string, string> = {}
    const rejectedNames: string[] = []
    for (const c of pendingConfirmations) {
      const selected = (pairSelections[c.pdfName] ?? "").trim()
      if (selected) {
        nameMappings[c.pdfName] = selected
      } else {
        rejectedNames.push(c.pdfName)
      }
    }

    if (Object.keys(nameMappings).length === 0) {
      closeConfirmWithoutPairing()
      return
    }

    setConfirmError(null)
    setConfirmOpen(false)

    const importPromise =
      source === "pdf"
        ? runPdfImport({
            nameMappings,
            rejectedNames,
            cachedParse: cachedImportData?.cachedParse,
          })
        : runSwimphoneImport({ nameMappings, rejectedNames })

    startTask(
      "Importing paired results…",
      importPromise.then((data) => {
        finishImportCleanup()
        return buildImportSummary(data)
      })
    )
  }

  const pairedCount = pendingConfirmations.filter((c) =>
    Boolean((pairSelections[c.pdfName] ?? "").trim())
  ).length

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true)
          resetFormState()
        }}
        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 border border-border-secondary rounded-md bg-background hover:bg-fill transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3 w-3 shrink-0"
          aria-hidden="true"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Import Results
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Import SwimPhone and/or PDF Results"
        description={`${team.trim() || "Your team code's"} results will be matched to the ${season} roster.`}
        onSubmit={handleSubmit}
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={
                !team.trim() ||
                (!swimphoneUrl.trim() && !resultsPdfUrl.trim() && !selectedFile)
              }
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
            >
              Import
            </button>
          </ModalFooter>
        }
      >
        <div>
          <label className="block text-xs font-medium text-foreground-secondary mb-1">
            SwimPhone Results
          </label>
          <input
            value={swimphoneUrl}
            onChange={(e) => setSwimphoneUrl(e.target.value)}
            placeholder="https://www.swimphone.com/meets/..."
            className="w-full rounded-lg border border-border-secondary px-3 py-2 text-sm bg-background"
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-4">
            <label className="text-xs font-medium text-foreground-secondary">
              Results PDF
            </label>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setMode("file")}
                className={`text-xs px-2 py-1 rounded-md transition-colors ${
                  mode === "file"
                    ? "bg-primary text-white shadow-sm"
                    : "bg-fill-secondary text-foreground-secondary hover:bg-fill"
                }`}
              >
                File
              </button>
              <button
                type="button"
                onClick={() => setMode("url")}
                className={`text-xs px-2 py-1 rounded-md transition-colors ${
                  mode === "url"
                    ? "bg-primary text-white shadow-sm"
                    : "bg-fill-secondary text-foreground-secondary hover:bg-fill"
                }`}
              >
                URL
              </button>
            </div>
          </div>
          {mode === "file" ? (
            <FileDropzone
              onFilesSelected={(files) =>
                handleFileChange(files[0] ?? null)
              }
              accept=".pdf,application/pdf"
              className={fileDropzoneSurfaceClassName(Boolean(selectedFile))}
            >
              <FileDropzoneContent
                fileName={selectedFile?.name}
                emptyLabel="Click or drag and drop to upload a PDF"
                onRemove={() => setSelectedFile(null)}
              />
            </FileDropzone>
          ) : (
            <input
              value={resultsPdfUrl}
              onChange={(e) => setResultsPdfUrl(e.target.value)}
              placeholder="https://…/results.pdf"
              className="w-full rounded-lg border border-border-secondary px-3 py-2 text-sm bg-background"
            />
          )}
        </div>

        {error && <p className="text-sm text-error">{error}</p>}

        <div className="grid gap-3 grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-foreground-secondary mb-1">
              Team code <span className="text-red-500">*</span>
            </label>
            <input
              required
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              placeholder="GTSC"
              className="w-full rounded-lg border border-border-secondary px-3 py-2 text-sm bg-background"
            />
          </div>
          <div>
            <div>
              <label className="block text-xs font-medium text-foreground-secondary mb-1">
                Course
              </label>
              <select
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                className="w-full rounded-lg border border-border-secondary px-3 py-2 text-sm bg-background"
              >
                <option value="SCY">SCY</option>
                <option value="LCM">LCM</option>
                <option value="SCM">SCM</option>
              </select>
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-400 dark:text-zinc-500 -mt-2">
          Only swimmers listed under this team in the results are imported.
        </p>
      </Modal>

      <Modal
        open={confirmOpen}
        onClose={closeConfirmWithoutPairing}
        title="Pair unmatched athletes"
        description="These names matched your team code but not the roster. Pair them to a roster athlete to import their results."
        onSubmit={handleConfirmSubmit}
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={closeConfirmWithoutPairing}
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
              c.athleteId && c.athleteName
                ? { id: c.athleteId, name: c.athleteName }
                : null
            return (
              <li
                key={c.pdfName}
                className="rounded-xl border bg-fill-secondary px-4 py-3 border-border"
              >
                <p className="text-sm text-foreground">
                  <strong>{c.pdfName}</strong>
                </p>
                <p className="mt-0.5 text-xs text-foreground-secondary">
                  {c.occurrences} result{c.occurrences === 1 ? "" : "s"} with this spelling
                  {suggested ? (
                    <span>
                      {" "}
                      · suggested match: {suggested.name}
                    </span>
                  ) : null}
                </p>
                <label className="mt-3 block">
                  <span className="sr-only">Roster athlete for {c.pdfName}</span>
                  <select
                    value={selected}
                    onChange={(e) =>
                      setPairSelections((prev) => ({
                        ...prev,
                        [c.pdfName]: e.target.value,
                      }))
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
        {confirmError && (
          <p className="text-sm text-error">{confirmError}</p>
        )}
      </Modal>
    </>
  )
}
