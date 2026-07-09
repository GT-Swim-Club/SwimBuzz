"use client"

import { useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { formatSwimDate } from "@/lib/utils"
import { currentSeason, parseSeason } from "@/lib/season"
import Modal, { ModalFooter } from "@/components/Modal"

type ImportSource = "pdf" | "swimphone"

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
}

export default function ImportMeetButton({
  meetId,
  season: seasonProp,
}: {
  meetId?: string
  season?: string
} = {}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fileRef = useRef<HTMLInputElement>(null)

  const season =
    seasonProp ??
    parseSeason(searchParams.get("season") ?? searchParams.get("year")) ??
    currentSeason()

  const [open, setOpen] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [source, setSource] = useState<ImportSource>("swimphone")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [url, setUrl] = useState("")
  const [team, setTeam] = useState("GTSC")
  const [course, setCourse] = useState("SCY")


  function resetForm() {
    setSource("swimphone")
    setError(null)
    setResult(null)
    setSelectedFile(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSelectedFile(e.target.files?.[0] ?? null)
    setError(null)
    setResult(null)
  }

  function showImportResult(data: ImportResult) {
    setResult(data)
    setOpen(false)
    setResultOpen(true)
    router.refresh()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const teamCode = team.trim()
    if (!teamCode) {
      setError("Team code is required")
      return
    }

    if (source === "pdf") {
      if (!selectedFile) {
        setError("Choose a PDF file first")
        return
      }

      setLoading(true)
      setError(null)
      setResult(null)

      const body = new FormData()
      body.append("file", selectedFile, selectedFile.name)
      body.append("course", course)
      body.append("team", teamCode)
      body.append("season", season)
      if (meetId) body.append("meetId", meetId)

      try {
        const res = await fetch("/api/meets/import", { method: "POST", body })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error ?? "Import failed")
          return
        }
        showImportResult(data)
        setSelectedFile(null)
        if (fileRef.current) fileRef.current.value = ""
      } catch {
        setError("Upload failed — check that the dev server and scraper are running")
      } finally {
        setLoading(false)
      }
      return
    }

    const trimmed = url.trim()
    if (!trimmed) {
      setError("Paste a SwimPhone meet URL")
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch("/api/meets/import/swimphone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed, season, meetId, team: teamCode }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Import failed")
        return
      }
      showImportResult(data)
    } catch {
      setError("Import failed — check that the dev server and scraper are running")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true)
          resetForm()
        }}
        className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 border rounded-md hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-950 transition-colors"
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
        closeDisabled={loading}
        busy={loading}
        title="Import Meet Results"
        description={`Only results for your team code are imported, then matched to the ${season} roster.`}
        header={
          <div className="mt-4 flex rounded-lg border dark:border-zinc-700 p-0.5 bg-gray-50 dark:bg-zinc-950">
            {(
              [
                ["swimphone", "SwimPhone"],
                ["pdf", "Results PDF"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setSource(value)
                  setError(null)
                  setResult(null)
                }}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  source === value
                    ? "bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 shadow-sm"
                    : "text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
        onSubmit={handleSubmit}
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={loading}
              className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 dark:border-zinc-700"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={
                loading ||
                !team.trim() ||
                (source === "pdf" ? !selectedFile : !url.trim())
              }
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? (source === "swimphone" ? "Scraping…" : "Importing…") : "Import"}
            </button>
          </ModalFooter>
        }
      >
        <div key={source}>
          {source === "pdf" ? (
            <div>
              <span className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">
                Results PDF
              </span>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleFileChange}
                className="sr-only"
                id="meet-pdf-upload"
              />
              <div className="flex items-center gap-3">
                <label
                  htmlFor="meet-pdf-upload"
                  className="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 dark:border-zinc-700"
                >
                  Choose PDF
                </label>
                <span className="text-sm text-gray-600 dark:text-zinc-400 truncate">
                  {selectedFile ? selectedFile.name : "No file selected"}
                </span>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">
                Meet URL
              </label>
              <input
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.swimphone.com/meets/meet_menu.cfm?smid=..."
                className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-zinc-950 dark:border-zinc-700"
              />
              <p className="mt-1.5 text-xs text-gray-400 dark:text-zinc-500">
                On the hosted app, connect Local sync first — SwimPhone often blocks the server.
                Archived meets may also require email + reCAPTCHA on SwimPhone.
              </p>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div
          key={`options-${source}`}
          className={`grid gap-3 ${source === "pdf" ? "grid-cols-2" : "grid-cols-1"}`}
        >
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">
              Team code
            </label>
            <input
              required
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              placeholder="GTSC"
              className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-zinc-950 dark:border-zinc-700"
            />
          </div>
          {source === "pdf" ? (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">
                Course
              </label>
              <select
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm dark:bg-zinc-950 dark:border-zinc-700"
              >
                <option value="SCY">SCY</option>
                <option value="LCM">LCM</option>
                <option value="SCM">SCM</option>
              </select>
            </div>
          ) : null}
        </div>
        <p className="text-xs text-gray-400 dark:text-zinc-500 -mt-2">
          Only swimmers listed under this team in the results are imported.
        </p>
      </Modal>

      <Modal
        open={resultOpen}
        onClose={() => {
          setResultOpen(false)
          setResult(null)
        }}
        title="Import complete"
        footer={
          <ModalFooter>
            <button
              type="button"
              onClick={() => {
                setResultOpen(false)
                setResult(null)
              }}
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Done
            </button>
          </ModalFooter>
        }
      >
        {result ? (
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-800/50">
            {result.meetName && (
              <p className="mb-1 text-gray-900 dark:text-zinc-100">
                <strong>{result.meetName}</strong>
                {result.meetDate && (
                  <span className="text-gray-500 dark:text-zinc-400">
                    {" "}
                    — {formatSwimDate(result.meetDate)}
                  </span>
                )}
              </p>
            )}
            <p className="text-gray-900 dark:text-zinc-100">
              Imported <strong>{result.imported}</strong> new swims ({result.parsed} parsed,{" "}
              {result.matched} matched to roster).
              {typeof result.leadoffsImported === "number" && result.leadoffsImported > 0 && (
                <span className="text-gray-600 dark:text-zinc-400">
                  {" "}
                  Includes {result.leadoffsImported} relay leadoff
                  {result.leadoffsImported === 1 ? "" : "s"} from split times.
                </span>
              )}
            </p>
            {result.captchaLimited && (
              <p className="mt-2 text-amber-700 dark:text-amber-400">
                SwimPhone blocked some archived results; only partial data was imported.
              </p>
            )}
            {result.incompleteRelays && result.incompleteRelays.length > 0 && (
              <div className="mt-2 text-amber-700 dark:text-amber-400">
                <p>
                  Relay results skipped for {result.incompleteRelays.length} event(s) with
                  incomplete split data:
                </p>
                <p className="mt-0.5 text-xs">{result.incompleteRelays.join(", ")}</p>
              </div>
            )}
            {result.unmatchedCount > 0 && (
              <p className="mt-2 text-gray-600 dark:text-zinc-400">
                {result.unmatchedCount} result(s) could not be matched to a roster athlete.
                {result.unmatched.length > 0 && (
                  <span className="block mt-1 text-xs">
                    e.g. {result.unmatched[0].name} — {result.unmatched[0].event}{" "}
                    {result.unmatched[0].time}
                  </span>
                )}
              </p>
            )}
          </div>
        ) : null}
      </Modal>
    </>
  )
}
