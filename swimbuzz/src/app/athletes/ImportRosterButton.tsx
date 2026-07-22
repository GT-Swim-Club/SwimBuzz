"use client"

import { useRef, useState } from "react"
import Image from "next/image"
import { useRouter, useSearchParams } from "next/navigation"
import { currentSeason, parseSeason, seasonEndYear } from "@/lib/season"
import Modal, { ModalFooter } from "@/components/Modal"
import { useScraperUi } from "@/components/ScraperUiProvider"

type ImportSource = "swimcloud" | "csv"

type SwimCloudResult = {
  created: number
  updated: number
  linked?: number
  unmatched?: number
  alreadyLinked?: number
  skippedConflict?: number
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

  const { connected: bridgeConnected, requireScraper } = useScraperUi()

  const [open, setOpen] = useState(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [source, setSource] = useState<ImportSource>("csv")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RosterImportResult | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const modalDescription =
    source === "csv"
      ? `Adds athletes to the ${csvRosterLabel} roster.`
      : `Imports SwimCloud IDs onto the existing ${rosterLabel} roster.`

  function resetForm() {
    setSource("csv")
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
      requireScraper(() => {
        void (async () => {
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
              }),
            })
            const data = await res.json()
            if (!res.ok) {
              setError(data.error ?? "Import failed")
              return
            }
            showImportResult({ source: "swimcloud", ...data })
          } catch {
            setError("Import failed — check that the scraper is running")
          } finally {
            setLoading(false)
          }
        })()
      })
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
        className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 border border-border-secondary rounded-lg hover:border-border hover:bg-fill-tertiary bg-fill-secondary dark:hover:bg-fill-tertiary dark:bg-background transition-colors"
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
          <div className="mt-4 flex rounded-lg border border-border-secondary dark:border border-border-secondary p-0.5 bg-fill-secondary dark:bg-background-elevated">
            {(
              [
                ["csv", "CSV", "icon"] as const,
                ["swimcloud", "SwimCloud IDs", "logo"] as const,
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
                    ? "bg-background dark:bg-zinc-800 text-foreground dark:text-foreground shadow-sm"
                    : "text-foreground-secondary dark:text-foreground-secondary hover:text-foreground dark:hover:text-foreground"
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
              className="flex-1 rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary hover:bg-fill-secondary border-border-secondary"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? "Importing…" : "Import"}
            </button>
          </ModalFooter>
        }
      >
        {source === "swimcloud" ? (
          <div className="space-y-2 text-md text-foreground-secondary text-foreground-secondary">
            <p>
              Imports SwimCloud IDs for athletes already on your roster. Does not add new athletes.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-border-secondary bg-fill-secondary px-4 py-3 text-sm">
              <p className="font-medium text-foreground text-foreground">Required columns</p>
              <ul className="mt-2 space-y-1.5 text-foreground-secondary text-foreground-secondary">
                <li>
                  <span className="font-medium text-gray-800 dark:text-zinc-200">Name</span>
                  {" — "}
                  <span className="text-foreground-secondary text-foreground-secondary">
                    First Name & Last Name, or just a Full Name column
                  </span>
                </li>
                <li>
                  <span className="font-medium text-gray-800 dark:text-zinc-200">Gender</span>
                  {" — "}
                  <span className="text-foreground-secondary text-foreground-secondary">
                    M/F, Male/Female, Men/Women, or Boy/Girl
                  </span>
                </li>
              </ul>
              <p className="mt-3 text-xs text-foreground-tertiary">
                Optional: Email, SwimCloud ID, Nicknames.
              </p>
            </div>

            <div>
              <span className="block text-xs font-medium text-foreground-secondary text-foreground-secondary mb-1">
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
                  className="cursor-pointer rounded-lg border border-border-secondary border-primary bg-primary px-4 py-2 text-sm font-medium text-primary-text hover:bg-primary-hover"
                >
                  Choose CSV
                </label>
                <span className="text-sm text-foreground-secondary text-foreground-secondary truncate">
                  {selectedFile ? selectedFile.name : "No file selected"}
                </span>
              </div>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-error">{error}</p>}
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
              className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover"
            >
              Done
            </button>
          </ModalFooter>
        }
      >
        {result?.source === "swimcloud" && (
          <div className="rounded-xl border border-border-secondary border-gray-100 bg-gray-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-800/50">
            <p className="text-foreground text-foreground">
              Imported SwimCloud IDs on <strong>{result.linked ?? result.updated}</strong> athlete
              {(result.linked ?? result.updated) === 1 ? "" : "s"}
              .
            </p>
            {(result.unmatched ?? 0) > 0 && (
              <p className="mt-2 text-amber-700 dark:text-amber-400 text-xs">
                {result.unmatched} SwimCloud name
                {result.unmatched === 1 ? "" : "s"} had no roster match.
              </p>
            )}
            {(result.alreadyLinked ?? 0) > 0 && (
              <p className="mt-1 text-foreground-secondary text-foreground-secondary text-xs">
                {result.alreadyLinked} already had a SwimCloud ID.
              </p>
            )}
            {(result.skippedConflict ?? 0) > 0 && (
              <p className="mt-1 text-amber-700 dark:text-amber-400 text-xs">
                {result.skippedConflict} skipped due to SwimCloud ID conflicts.
              </p>
            )}
          </div>
        )}

        {result?.source === "csv" && (
          <div className="rounded-xl border border-border-secondary border-gray-100 bg-gray-50 px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-800/50">
            <p className="text-foreground text-foreground">
              Imported <strong>{result.created}</strong> new athlete
              {result.created === 1 ? "" : "s"}
              {result.updated > 0 && (
                <>
                  , updated <strong>{result.updated}</strong> existing
                </>
              )}
              {result.parsed > 0 && (
                <span className="text-foreground-secondary text-foreground-secondary">
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
