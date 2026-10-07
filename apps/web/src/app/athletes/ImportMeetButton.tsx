"use client"

import type { ReactNode } from "react"
import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { currentSeason, parseSeason } from "@/lib/season"
import { formatSeasonLabel } from "@swimbuzz/shared"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import { useResultsImport } from "@/components/meet/useResultsImport"
import { FileDropzone, FileDropzoneContent, fileDropzoneSurfaceClassName } from "@/components/ui/FileDropzone"

export default function ImportMeetButton({
  meetId,
  season: seasonProp,
  resultsUrl: initialResultsUrl = "",
  swimphoneUrl: initialSwimphoneUrl = "",
  trigger,
}: {
  meetId?: string
  season?: string
  resultsUrl?: string
  swimphoneUrl?: string
  /** Custom trigger; receives the function that opens the dialog. */
  trigger?: (open: () => void) => ReactNode
} = {}) {
  const searchParams = useSearchParams()

  const season =
    seasonProp ??
    parseSeason(searchParams.get("season") ?? searchParams.get("year")) ??
    currentSeason()

  const { startImport, pairingModal } = useResultsImport({ meetId, season })

  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [mode, setMode] = useState<"url" | "file">(initialResultsUrl ? "url" : "file")
  const [resultsPdfUrl, setResultsPdfUrl] = useState(initialResultsUrl)
  const [swimphoneUrl, setSwimphoneUrl] = useState(initialSwimphoneUrl)
  const [team, setTeam] = useState("GTSC")
  const [course, setCourse] = useState("SCY")

  function handleFileChange(file: File | null) {
    setSelectedFile(file)
    setResultsPdfUrl("")
    setError(null)
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
    if (hasSwimphone) {
      startImport(
        { kind: "swimphone", url: swimphoneUrl },
        { team, course, before: saveResultsPdfResource }
      )
    } else {
      startImport(
        { kind: "pdf", pdfUrl: mode === "url" ? resultsPdfUrl : "", file: selectedFile },
        { team, course, before: saveSwimphoneResource }
      )
    }
    setOpen(false)
  }

  return (
    <>
      {trigger ? (
        trigger(() => {
          setOpen(true)
          setError(null)
        })
      ) : (
        <button
          type="button"
          onClick={() => {
            setOpen(true)
            setError(null)
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
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Import SwimPhone and/or PDF Results"
        description={`${team.trim() || "Your team code's"} results will be matched to the ${formatSeasonLabel(season)} roster.`}
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

      {pairingModal}
    </>
  )
}
