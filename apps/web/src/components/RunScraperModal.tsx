"use client"

import { useEffect, useState } from "react"
import Modal, { ModalFooter } from "@/components/Modal"
import { formatClockTime } from "@swimbuzz/shared"

type Pairing = {
  code: string
  expiresAt: string
}

type Platform = "mac" | "windows"

function scraperCommands(appUrl: string, code?: string) {
  const macInstall = `curl -fsSL ${appUrl}/scraper/install.sh | bash -s -- ${appUrl}`
  const macRun = code
    ? `~/.local/bin/swimbuzz-scraper --url ${appUrl} --code ${code}`
    : ""

  const winInstallPortable = `curl.exe -fsSL ${appUrl}/scraper/install.ps1 -o $env:TEMP\\swimbuzz-install.ps1; powershell -NoProfile -ExecutionPolicy Bypass -File $env:TEMP\\swimbuzz-install.ps1 -AppUrl ${appUrl}`
  const winRun = code
    ? `& "$env:USERPROFILE\\.local\\bin\\swimbuzz-scraper.cmd" --url ${appUrl} --code ${code}`
    : ""

  return {
    mac: { install: macInstall, run: macRun },
    windows: { install: winInstallPortable, run: winRun },
  }
}

export default function RunScraperModal({
  open,
  onClose,
  connected,
  loading,
  refresh,
}: {
  open: boolean
  onClose: () => void
  connected: boolean
  loading: boolean
  refresh: () => Promise<unknown>
}) {
  const [platform, setPlatform] = useState<Platform>("mac")
  const [pairing, setPairing] = useState<Pairing | null>(null)
  const [pairingLoading, setPairingLoading] = useState(false)
  const [terminating, setTerminating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [installed, setInstalled] = useState<boolean | null>(null)
  const [copied, setCopied] = useState<"install" | "run" | null>(null)

  const copyIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>
  )

  const checkIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
  )

  const appUrl =
    typeof window !== "undefined" ? window.location.origin : "https://swimbuzz.gtswimclub.com"

  const commands = scraperCommands(appUrl, pairing?.code)
  const installCommand = commands[platform].install
  const runCommand = commands[platform].run

  useEffect(() => {
    if (!open) return
    setError(null)
    void refresh()
    setInstalled(localStorage.getItem("swimbuzz-scraper-installed") === "1")
    const saved = localStorage.getItem("swimbuzz-scraper-platform")
    if (saved === "mac" || saved === "windows") setPlatform(saved)
  }, [open, refresh])

  function setPlatformAndSave(next: Platform) {
    setPlatform(next)
    localStorage.setItem("swimbuzz-scraper-platform", next)
  }

  async function generateCode() {
    setPairingLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/scraper/pairing", { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Could not generate code")
        return
      }
      setPairing({ code: data.code, expiresAt: data.expiresAt })
    } catch {
      setError("Could not generate code")
    } finally {
      setPairingLoading(false)
    }
  }

  async function terminateScraper() {
    setTerminating(true)
    setError(null)
    try {
      await fetch("/api/scraper/status", { method: "DELETE" })
      setPairing(null)
      await refresh()
    } catch {
      setError("Could not terminate scraper")
    } finally {
      setTerminating(false)
    }
  }

  async function copyText(text: string, type: "install" | "run") {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(type)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // ignore
    }
  }

  function markInstalled() {
    localStorage.setItem("swimbuzz-scraper-installed", "1")
    setInstalled(true)
  }

  const platformToggle = (
    <div className="mt-5 flex gap-1 rounded-xl border border-border bg-fill-secondary p-1">
      {(
        [
          ["mac", "Mac / Linux"],
          ["windows", "Windows"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => setPlatformAndSave(value)}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            platform === value
              ? "bg-primary text-primary-text shadow-sm"
              : "text-foreground-secondary hover:text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )

  const isExpired = pairing ? new Date(pairing.expiresAt).getTime() < Date.now() : false;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Run the Scraper"
      description="Install the scraper once, and then run it whenever importing data."
      maxWidth="lg"
      header={platformToggle}
      bodyClassName="!flex-initial py-5 sm:py-5"
      footer={
        <ModalFooter>
          {connected && (
            <button
              type="button"
              onClick={() => void terminateScraper()}
              disabled={terminating}
              className="rounded-lg border border-error bg-error-bg px-4 py-2.5 text-sm font-medium text-error transition-colors hover:bg-error/10 disabled:opacity-50"
            >
              {terminating ? "Terminating…" : "Terminate scraper"}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text transition-colors hover:bg-primary-hover"
          >
            Done
          </button>
        </ModalFooter>
      }
    >
      <div className="space-y-5 text-sm">
        <div
          className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
            loading
              ? "border-border-secondary bg-fill-secondary text-foreground-secondary"
              : connected
                ? "border-success bg-success-bg text-success"
                : "border-warning bg-warning-bg text-warning"
          }`}
        >
          <span
            aria-hidden="true"
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${
              loading
                ? "bg-foreground-tertiary"
                : connected
                  ? "bg-success motion-safe:animate-pulse"
                  : "bg-warning"
            }`}
          />
          <p className="font-medium">
            {loading
              ? ["Checking", "status…"].join(" ")
              : connected
                ? "The scraper is running. You can now import data."
                : "The scraper is not running."}
          </p>
        </div>

        {installed === false && (
          <div className="space-y-3 rounded-xl border border-border-secondary bg-fill-secondary p-4">
            <p className="font-medium text-foreground">One-time setup</p>
            <p className="text-foreground-secondary">
              Downloads the scraper via <code className="text-xs">uv</code>.
              {platform === "windows" ? " Run in PowerShell." : " Run in Terminal."}
            </p>
            <pre className="overflow-x-auto rounded-lg border border-border-subtle bg-background px-3 py-2.5 text-xs leading-5 text-foreground whitespace-pre-wrap break-all">
              {installCommand}
            </pre>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <button
                type="button"
                onClick={() => void copyText(installCommand, "install")}
                className="flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:text-primary-hover"
              >
                {copied === "install" ? checkIcon : copyIcon}
                Copy install command
              </button>
              <button
                type="button"
                onClick={markInstalled}
                className="text-xs font-medium text-foreground-secondary transition-colors hover:text-foreground"
              >
                I&apos;ve installed it
              </button>
            </div>
          </div>
        )}

        <ol className="list-decimal space-y-2.5 pl-5 leading-6 text-foreground marker:font-semibold marker:text-foreground-secondary">
          {installed === false && <li>Run the one-time install command above.</li>}
          <li>Generate the run command below (valid for 15 minutes).</li>
          <li>Copy it into your terminal and leave it running.</li>
          <li>Import data, e.g. SwimCloud times, SwimPhone results, meet PDFs</li>
        </ol>

        {installed && (
          <button
            type="button"
            onClick={() => setInstalled(false)}
            className="inline-flex rounded-md px-1 py-0.5 text-xs font-medium text-foreground-secondary transition-colors hover:text-foreground"
          >
            Show install instructions again
          </button>
        )}

        {!connected &&
          (!pairing || isExpired ? (
            <button
              type="button"
              onClick={() => void generateCode()}
              disabled={pairingLoading}
              className="w-full rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary disabled:opacity-50"
            >
              {pairingLoading ? "Generating…" : "Generate run command"}
            </button>
          ) : (
            <div className="space-y-3 rounded-xl border border-border-secondary bg-fill-secondary p-4">
              <p className="text-xs text-foreground-secondary">
                Expires {formatClockTime(new Date(pairing.expiresAt))}
              </p>
              <pre className="overflow-x-auto rounded-lg border border-border-subtle bg-background px-3 py-2.5 text-xs leading-5 text-foreground whitespace-pre-wrap break-all">
                {runCommand}
              </pre>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <button
                  type="button"
                  onClick={() => void copyText(runCommand, "run")}
                  className="flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:text-primary-hover"
                >
                  {copied === "run" ? checkIcon : copyIcon}
                  Copy command
                </button>
                <button
                  type="button"
                  onClick={() => void generateCode()}
                  disabled={pairingLoading}
                  className="text-xs font-medium text-foreground-secondary transition-colors hover:text-foreground"
                >
                  Generate new command
                </button>
              </div>
            </div>
          ))}

        {error ? <p className="text-sm text-error">{error}</p> : null}
      </div>
    </Modal>
  )
}
