"use client"

import { useRef, useState } from "react"
import Image from "next/image"
import { useRouter, useSearchParams } from "next/navigation"
import { currentSeason, parseSeason, seasonEndYear } from "@/lib/season"
import Modal, { ModalFooter } from "@/components/Modal"
import { useBridgeStatus } from "@/lib/use-bridge-status"

type ImportSource = "swimcloud" | "csv"

type SwimCloudResult = {
  created: number
  updated: number
}

type CsvResult = {
  created: number
  updated: number
  parsed: number
  errors: Array<{ row: number; message: string }>
}

type RosterImportResult =
  | ({ source: "swimcloud" } & SwimCloudResult)
  | ({ source: "csv" } & CsvResult)

export default function ImportRosterButton() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fileRef = useRef<HTMLInputElement>(null)

  const gender = searchParams.get("gender") === "F" ? "F" : "M"
  const season =
    parseSeason(searchParams.get("season") ?? searchParams.get("year")) ?? currentSeason()
  const rosterLabel = `${gender === "F" ? "Women" : "Men"} ${season}`
  const csvRosterLabel = `Women's & Men's ${season}`

  const { connected: bridgeConnected } = useBridgeStatus()

  const [open, setOpen] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [source, setSource] = useState<ImportSource>("swimcloud")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RosterImportResult | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const modalDescription =
    source === "csv"
      ? `Adds athletes to the ${csvRosterLabel} roster.`
      : `Adds athletes to the ${rosterLabel} roster.`

  function resetForm() {
    setSource("swimcloud")
    setError(null)
    setSelectedFile(null)
    if (fileRef.current) fileRef.current.value = ""
  }

  function showImportResult(data: RosterImportResult) {
    setResult(data)
    setOpen(false)
    setResultOpen(true)
    router.refresh()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSelectedFile(e.target.files?.[0] ?? null)
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (source === "swimcloud") {
      setLoading(true)
      setError(null)

      try {
        const res = await fetch("/api/roster/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            season,
            year: seasonEndYear(season),
            gender,
            useBridge: bridgeConnected,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error ?? "Import failed")
          return
        }
        showImportResult({ source: "swimcloud", ...data })
      } catch {
        setError("Import failed — check that the dev server and scraper are running")
      } finally {
        setLoading(false)
      }
      return
    }

    if (!selectedFile) {
      setError("Choose a CSV file first")
      return
    }

    setLoading(true)
    setError(null)

    const body = new FormData()
    body.append("file", selectedFile, selectedFile.name)
    body.append("season", season)

    try {
      const res = await fetch("/api/roster/import", { method: "POST", body })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Import failed")
        return
      }
      showImportResult({ source: "csv", ...data })
      setSelectedFile(null)
      if (fileRef.current) fileRef.current.value = ""
    } catch {
      setError("Import failed — check that the dev server is running")
    } finally {
      setLoading(false)
    }
  }

  const canSubmit =
    source === "swimcloud" ? !loading : !loading && !!selectedFile

  return (
    <>
      <button
        type="button"
        onClick={() => {
          resetForm()
          setOpen(true)
        }}
        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 border rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-950 transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5 shrink-0"
          aria-hidden="true"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Import Roster
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        closeDisabled={loading}
        busy={loading}
        title="Import Roster"
        description={modalDescription}
        header={
          <div className="mt-4 flex rounded-lg border dark:border-zinc-700 p-0.5 bg-gray-50 dark:bg-zinc-950">
            {(
              [
                ["swimcloud", "SwimCloud", "logo"] as const,
                ["csv", "CSV", "icon"] as const,
              ] as const
            ).map(([value, label, adornment]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setSource(value)
                  setError(null)
                }}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  source === value
                    ? "bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 shadow-sm"
                    : "text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-300"
                }`}
              >
                {adornment === "logo" && (
                  <Image
                    src="/swimcloud.webp"
                    alt=""
                    width={20}
                    height={20}
                    className="shrink-0"
                  />
                )}
                {adornment === "icon" && (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4 shrink-0"
                    aria-hidden="true"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                )}
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
              disabled={!canSubmit}
              className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? "Importing…" : "Import"}
            </button>
          </ModalFooter>
        }
      >
        {source === "swimcloud" ? (
          <div className="space-y-2 text-sm text-gray-600 dark:text-zinc-400">
            <p>
              Pulls the {rosterLabel} roster from SwimCloud. Existing athletes are merged.
            </p>
            {bridgeConnected ? (
              <p className="text-emerald-700 dark:text-emerald-400">
                Local sync is connected — Chromium will open on your computer if Cloudflare
                prompts you.
              </p>
            ) : (
              <p className="text-amber-700 dark:text-amber-400">
                Connect Local sync first on hosted apps, or run the scraper locally for dev.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-800/50">
              <p className="font-medium text-gray-900 dark:text-zinc-100">Required columns</p>
              <ul className="mt-2 space-y-1.5 text-gray-600 dark:text-zinc-400">
                <li>
                  <span className="font-medium text-gray-800 dark:text-zinc-200">Name</span>
                  {" — "}
                  <span className="text-gray-600 dark:text-zinc-400">
                    First Name & Last Name, or just a Full Name column
                  </span>
                </li>
                <li>
                  <span className="font-medium text-gray-800 dark:text-zinc-200">Gender</span>
                  {" — "}
                  <span className="text-gray-600 dark:text-zinc-400">
                    M/F, Male/Female, Men/Women, or Boys/Girls
                  </span>
                </li>
              </ul>
              <p className="mt-3 text-xs text-gray-500 dark:text-zinc-500">
                Optional: Email, SwimCloud ID, Nicknames.
              </p>
            </div>

            <div>
              <span className="block text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">
                Roster CSV
              </span>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="sr-only"
                id="roster-csv-upload"
              />
              <div className="flex items-center gap-3">
                <label
                  htmlFor="roster-csv-upload"
                  className="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 dark:border-zinc-700"
                >
                  Choose CSV
                </label>
                <span className="text-sm text-gray-600 dark:text-zinc-400 truncate">
                  {selectedFile ? selectedFile.name : "No file selected"}
                </span>
              </div>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
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
        {result?.source === "swimcloud" && (
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-800/50">
            <p className="text-gray-900 dark:text-zinc-100">
              Imported <strong>{result.created}</strong> new athlete
              {result.created === 1 ? "" : "s"}
              {result.updated > 0 && (
                <>
                  , merged <strong>{result.updated}</strong> existing
                </>
              )}
              .
            </p>
          </div>
        )}

        {result?.source === "csv" && (
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-800/50">
            <p className="text-gray-900 dark:text-zinc-100">
              Imported <strong>{result.created}</strong> new athlete
              {result.created === 1 ? "" : "s"}
              {result.updated > 0 && (
                <>
                  , updated <strong>{result.updated}</strong> existing
                </>
              )}
              {result.parsed > 0 && (
                <span className="text-gray-500 dark:text-zinc-400">
                  {" "}
                  ({result.parsed} rows parsed)
                </span>
              )}
              .
            </p>
            {result.errors.length > 0 && (
              <p className="mt-2 text-amber-700 dark:text-amber-400 text-xs">
                {result.errors.length} row(s) skipped:{" "}
                {result.errors
                  .slice(0, 3)
                  .map((e) => `row ${e.row} (${e.message})`)
                  .join("; ")}
                {result.errors.length > 3 ? "…" : ""}
              </p>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}
