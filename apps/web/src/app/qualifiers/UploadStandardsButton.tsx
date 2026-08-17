"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Modal, { ModalFooter } from "@/components/Modal"
import { useScraperUi } from "@/components/ScraperUiProvider"
import { useImportTask } from "@/components/ImportTaskProvider"
import { currentSeason } from "@/lib/season"
import { FileDropzone, FileDropzoneContent, fileDropzoneSurfaceClassName } from "@/components/FileDropzone"

type Source = "pdf" | "url"

export default function UploadStandardsButton({
  season: seasonProp,
  course: courseProp = "SCY",
}: {
  season?: string
  course?: string
}) {
  const router = useRouter()
  const { requireScraper } = useScraperUi()
  const { startTask } = useImportTask()

  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<Source>("pdf")
  const [season, setSeason] = useState(seasonProp ?? currentSeason())
  const [course, setCourse] = useState(courseProp ?? "SCY")
  const [url, setUrl] = useState("")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fetchedSeasons, setFetchedSeasons] = useState<string[]>([])

  useEffect(() => {
    fetch("/api/seasons")
        .then(res => res.ok ? res.json() : [])
        .then(setFetchedSeasons)
        .catch(() => setFetchedSeasons([]))
  }, [])

  function resetForm() {
    setError(null)
    setSource("pdf")
    setSeason(seasonProp ?? currentSeason())
    setCourse(courseProp ?? "SCY")
    setUrl("")
    setSelectedFile(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setOpen(false) // Close immediately

    const form = new FormData()
    form.set("season", season)
    form.set("course", course)
    if (source === "url") {
        form.set("url", url.trim())
    } else {
        if (!selectedFile) throw new Error("Choose a PDF file first")
        form.set("file", selectedFile)
    }

    startTask(
      "Uploading standards...",
      (async () => {
        const res = await fetch("/api/qualifiers", { method: "POST", body: form })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(typeof data.error === "string" ? data.error : "Upload failed")
        }
        if (data.jobId) {
          const { pollScraperJob } = await import("@/lib/scraper-job-client")
          await pollScraperJob(data.jobId)
          const fin = await fetch("/api/qualifiers/finalize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jobId: data.jobId }),
          })
          const finalized = await fin.json().catch(() => ({}))
          if (!fin.ok) {
            throw new Error(
              typeof finalized.error === "string" ? finalized.error : "Upload failed"
            )
          }
        }
        router.push(`/qualifiers?season=${encodeURIComponent(season)}&gender=all`)
        router.refresh()
        return "Standards uploaded successfully"
      })()
    )
    resetForm()
  }

  return (
    <>
      <button
        type="button"
        onClick={() =>
          requireScraper(() => {
            resetForm()
            setOpen(true)
          })
        }
        className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-text hover:bg-primary-hover transition-colors"
      >
        Upload standards
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Upload Nationals standards"
        description="Add a Nationals Time Standards PDF file or URL."
        maxWidth="md"
        onSubmit={handleSubmit}
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary dark:border border-border-secondary dark:hover:bg-fill-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
            >
              Save standards
            </button>
          </ModalFooter>
        }
      >
        <div className="flex items-center gap-4 mb-2">
          <span className="text-xs font-medium text-foreground-secondary">Standards PDF</span>
          <div className="flex gap-1">
            {(["pdf", "url"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setSource(s)
                  setError(null)
                }}
                className={
                  "text-xs px-2 py-0.5 rounded-md border border-border transition-colors " +
                  (source === s
                    ? "bg-primary text-primary-text border-primary"
                    : "border-border text-foreground-secondary hover:bg-fill-secondary")
                }
              >
                {s === "url" ? "URL" : "File"}
              </button>
            ))}
          </div>
        </div>

        {source === "url" ? (
          <label key="url" className="block space-y-1">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…/nqts.pdf"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background border-border"
            />
          </label>
        ) : (
          <label key="pdf" className="block space-y-1">
            <FileDropzone
              onFilesSelected={(files) => {
                setSelectedFile(files[0] ?? null);
                setError(null);
              }}
              accept="application/pdf,.pdf"
              className={fileDropzoneSurfaceClassName(Boolean(selectedFile))}
            >
              <FileDropzoneContent
                fileName={selectedFile?.name}
                emptyLabel="Click or drag and drop to upload a PDF"
                onRemove={() => setSelectedFile(null)}
              />
            </FileDropzone>
          </label>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground-secondary dark:text-foreground-secondary">
              Course <span className="text-error">*</span>
            </span>
            <select
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background border-border"
            >
              <option value="SCY">SCY</option>
              <option value="LCM">LCM</option>
              <option value="SCM">SCM</option>
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground-secondary dark:text-foreground-secondary">
              Season <span className="text-error">*</span>
            </span>
            <select
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background border-border"
            >
              {fetchedSeasons.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? (
          <p className="text-sm text-error dark:text-error">{error}</p>
        ) : null}
      </Modal>
    </>
  )
}
