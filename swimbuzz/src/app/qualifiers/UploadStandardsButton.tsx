"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Modal, { ModalFooter } from "@/components/Modal"
import { useScraperUi } from "@/components/ScraperUiProvider"
import { currentSeason } from "@/lib/season"

type Source = "pdf" | "url"

export default function UploadStandardsButton({
  season: seasonProp,
  course: courseProp = "SCY",
}: {
  season?: string
  course?: string
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const { requireScraper } = useScraperUi()

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<Source>("url")
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
    setSource("url")
    setSeason(seasonProp ?? currentSeason())
    setCourse(courseProp ?? "SCY")
    setUrl("")
    setSelectedFile(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const form = new FormData()
      form.set("season", season)
      form.set("course", course)
      if (source === "url") {
        if (!url.trim()) throw new Error("Paste a PDF URL")
        form.set("url", url.trim())
      } else {
        if (!selectedFile) throw new Error("Choose a PDF file first")
        form.set("file", selectedFile)
      }

      const res = await fetch("/api/qualifiers", { method: "POST", body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Upload failed")
      }
      setOpen(false)
      resetForm()
      router.push(`/qualifiers?season=${encodeURIComponent(season)}&gender=all`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setLoading(false)
    }
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
        onClose={() => !loading && setOpen(false)}
        closeDisabled={loading}
        busy={loading}
        title="Upload Nationals standards"
        description="Paste a USMS NQT PDF URL or upload the file. Qualifiers are matched against meets from the selected season."
        maxWidth="md"
        onSubmit={handleSubmit}
        footer={
          <ModalFooter>
            <button
              type="button"
              disabled={loading}
              onClick={() => setOpen(false)}
              className="rounded-lg border border-border-secondary px-4 py-2 text-sm font-medium hover:bg-fill-secondary dark:border border-border-secondary dark:hover:bg-fill-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? "Parsing…" : "Save standards"}
            </button>
          </ModalFooter>
        }
      >
        <div className="flex gap-2">
          {(["url", "pdf"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setSource(s)
                setError(null)
              }}
              className={
                "rounded-lg border border-border-secondary px-3 py-1.5 text-xs font-medium transition-colors " +
                (source === s
                  ? "border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                  : "border border-border-secondary hover:bg-fill-secondary dark:hover:bg-fill-secondary")
              }
            >
              {s === "url" ? "PDF URL" : "Upload PDF"}
            </button>
          ))}
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-foreground-secondary dark:text-foreground-secondary">Season</span>
          <select
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            className="w-full rounded-lg border border-border-secondary px-3 py-2 text-sm dark:bg-background-elevated dark:border border-border-secondary"
          >
            {fetchedSeasons.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-foreground-secondary dark:text-foreground-secondary">Course</span>
          <select
            value={course}
            onChange={(e) => setCourse(e.target.value)}
            className="w-full rounded-lg border border-border-secondary px-3 py-2 text-sm dark:bg-background-elevated dark:border border-border-secondary"
          >
            <option value="SCY">SCY</option>
            <option value="LCM">LCM</option>
            <option value="SCM">SCM</option>
          </select>
        </label>

        {source === "url" ? (
          <label key="url" className="block space-y-1">
            <span className="text-xs font-medium text-foreground-secondary dark:text-foreground-secondary">PDF URL</span>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…/nqts.pdf"
              className="w-full rounded-lg border border-border-secondary px-3 py-2 text-sm dark:bg-background-elevated dark:border border-border-secondary"
            />
          </label>
        ) : (
          <label key="pdf" className="block space-y-1">
            <span className="text-xs font-medium text-foreground-secondary dark:text-foreground-secondary">PDF file</span>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => {
                setSelectedFile(e.target.files?.[0] ?? null)
                setError(null)
              }}
              className="block w-full text-sm text-foreground-secondary file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-text hover:file:bg-primary-hover"
            />
          </label>
        )}

        {error ? (
          <p className="text-sm text-error dark:text-error">{error}</p>
        ) : null}
      </Modal>
    </>
  )
}
