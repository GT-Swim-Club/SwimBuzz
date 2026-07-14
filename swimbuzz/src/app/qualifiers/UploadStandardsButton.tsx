"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Modal, { ModalFooter } from "@/components/Modal"
import { useScraperUi } from "@/components/ScraperUiProvider"
import { currentSeason, seasonOptions } from "@/lib/season"

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
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
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
              className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
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
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors " +
                (source === s
                  ? "border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                  : "dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800")
              }
            >
              {s === "url" ? "PDF URL" : "Upload PDF"}
            </button>
          ))}
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-gray-600 dark:text-zinc-400">Season</span>
          <select
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-zinc-950 dark:border-zinc-700"
          >
            {seasonOptions().map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-gray-600 dark:text-zinc-400">Course</span>
          <select
            value={course}
            onChange={(e) => setCourse(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-zinc-950 dark:border-zinc-700"
          >
            <option value="SCY">SCY</option>
            <option value="LCM">LCM</option>
            <option value="SCM">SCM</option>
          </select>
        </label>

        {source === "url" ? (
          <label key="url" className="block space-y-1">
            <span className="text-xs font-medium text-gray-600 dark:text-zinc-400">PDF URL</span>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…/nqts.pdf"
              className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-zinc-950 dark:border-zinc-700"
            />
          </label>
        ) : (
          <label key="pdf" className="block space-y-1">
            <span className="text-xs font-medium text-gray-600 dark:text-zinc-400">PDF file</span>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => {
                setSelectedFile(e.target.files?.[0] ?? null)
                setError(null)
              }}
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 dark:text-zinc-400 dark:file:bg-indigo-950 dark:file:text-indigo-300"
            />
          </label>
        )}

        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : null}
      </Modal>
    </>
  )
}
