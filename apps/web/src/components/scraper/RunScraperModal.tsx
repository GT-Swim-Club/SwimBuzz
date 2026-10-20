"use client"

import { useEffect, useState, type ReactNode } from "react"
import Modal, { ModalFooter } from "@/components/ui/Modal"
import { AppIcon } from "@/components/ui/AppIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import { formatClockTime } from "@swimbuzz/shared"
import { SegmentedToggle, segmentedOptionClass } from "@/components/ui/SegmentedToggle"

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
  const [wasConnected, setWasConnected] = useState(connected)

  // Pairing codes are single-use (consumed on register), so once the scraper
  // connects the shown run command is dead — drop it so stopping the scraper
  // from the terminal offers "Generate run command" instead of the stale code.
  if (connected !== wasConnected) {
    setWasConnected(connected)
    if (connected) setPairing(null)
  }

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


  const isExpired = pairing ? new Date(pairing.expiresAt).getTime() < Date.now() : false
  const shell = platform === "windows" ? "PowerShell" : "Terminal"

  const header = (
    <>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-medium text-foreground">Run Scraper</h2>
        <StatusPill loading={loading} connected={connected} />
      </div>
      <p className="mt-1 text-sm text-foreground-secondary">
        Required for SwimCloud and SwimPhone imports
      </p>
      <SegmentedToggle
        selectedIndex={platform === "windows" ? 1 : 0}
        fullWidth
        className="mt-5 rounded-xl border border-border bg-fill-secondary"
      >
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
            className={segmentedOptionClass(platform === value) + " py-2"}
          >
            {label}
          </button>
        ))}
      </SegmentedToggle>
    </>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidth="lg"
      header={header}
      bodyClassName="!flex-initial pt-5 pb-2 sm:pt-5 sm:pb-2"
      footer={
        <ModalFooter>
          {connected && (
            <button
              type="button"
              onClick={() => void terminateScraper()}
              disabled={terminating}
              className="rounded-lg border border-error bg-error-bg px-4 py-2.5 text-sm font-medium text-error transition-colors hover:bg-error/10 disabled:opacity-50"
            >
              {terminating ? "Stopping…" : "Stop scraper"}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-contrast transition-colors hover:bg-primary-hover"
          >
            Done
          </button>
        </ModalFooter>
      }
    >
      <div className="flex flex-col gap-[18px] text-sm">
        <Step number={1} done={installed === true}>
          <div className="flex min-h-6 items-center justify-between gap-3">
            <p className="font-medium text-foreground">Run the install command in {shell}</p>
            {installed === false && (
              <button type="button" onClick={markInstalled} className={textLinkClass}>
                I&apos;ve already installed it
              </button>
            )}
            {installed === true && (
              <button type="button" onClick={() => setInstalled(false)} className={textLinkClass}>
                Show again
              </button>
            )}
          </div>
          {installed === false && (
            <CommandBlock
              command={installCommand}
              copied={copied === "install"}
              onCopy={() => void copyText(installCommand, "install")}
              label="Copy install command"
            />
          )}
        </Step>

        <Step number={2} done={connected}>
          <div className="flex min-h-6 items-center justify-between gap-3">
            <p className="font-medium text-foreground">Run the run command in {shell}</p>
            {!connected && pairing && !isExpired && (
              <button
                type="button"
                onClick={() => void generateCode()}
                disabled={pairingLoading}
                className={textLinkClass}
              >
                New command
              </button>
            )}
          </div>
          {connected ? (
            <p className="text-foreground-secondary">
              Connected. Keep the terminal open while you import.
            </p>
          ) : !pairing || isExpired ? (
            <button
              type="button"
              onClick={() => void generateCode()}
              disabled={pairingLoading}
              className="w-full rounded-lg border border-border px-4 py-[9px] text-sm font-medium text-foreground transition-colors hover:bg-fill-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pairingLoading ? "Generating…" : "Generate run command"}
            </button>
          ) : (
            <CommandBlock
              command={runCommand}
              copied={copied === "run"}
              onCopy={() => void copyText(runCommand, "run")}
              label="Copy run command"
              footnote={`Expires ${formatClockTime(new Date(pairing.expiresAt))}`}
            />
          )}
        </Step>

        <Step number={3} done={false}>
          <p className="flex min-h-6 items-center font-medium text-foreground">
            Import SwimCloud times &amp; SwimPhone results
          </p>
        </Step>

        {error ? <p className="text-sm text-error">{error}</p> : null}
      </div>
    </Modal>
  )
}

const textLinkClass =
  "shrink-0 text-xs font-medium text-foreground-secondary transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"

function StatusPill({ loading, connected }: { loading: boolean; connected: boolean }) {
  const [label, pillClass, dotClass] = loading
    ? ["Checking…", "bg-fill-secondary text-foreground-secondary", "bg-foreground-tertiary"]
    : connected
      ? ["Running", "bg-success-bg text-success", "bg-success motion-safe:animate-pulse"]
      : ["Not running", "bg-warning-bg text-warning", "bg-warning"]
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-[3px] text-xs font-medium leading-[18px] ${pillClass}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
      {label}
    </span>
  )
}

function Step({
  number,
  done,
  children,
}: {
  number: number
  done: boolean
  children: ReactNode
}) {
  return (
    <div className="grid grid-cols-[24px_minmax(0,1fr)] gap-x-3.5">
      {done ? (
        <span
          aria-hidden="true"
          className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-contrast"
        >
          <AppIcon name="check" className="h-3.5 w-3.5" strokeWidth={2.5} />
        </span>
      ) : (
        <span
          aria-hidden="true"
          className="flex h-6 w-6 items-center justify-center rounded-full border border-border text-xs font-medium text-foreground-secondary"
        >
          {number}
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-2.5">{children}</div>
    </div>
  )
}

function CommandBlock({
  command,
  copied,
  onCopy,
  label,
  footnote,
}: {
  command: string
  copied: boolean
  onCopy: () => void
  label: string
  /** Tiny muted note pinned to the block's bottom-right corner. */
  footnote?: string
}) {
  return (
    <div className="relative">
      <pre
        className={`overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-border-secondary bg-fill-secondary pl-3 pr-11 pt-2.5 text-xs leading-5 text-foreground ${footnote ? "pb-3.5" : "pb-2.5"}`}
      >
        {command}
      </pre>
      {footnote ? (
        <span className="pointer-events-none absolute bottom-1.5 right-2.5 text-[10px] leading-none text-foreground-tertiary">
          {footnote}
        </span>
      ) : null}
      <button
        type="button"
        onClick={onCopy}
        aria-label={label}
        className="absolute right-1.5 top-1.5 flex h-[30px] w-[30px] items-center justify-center rounded-md text-foreground-secondary transition-colors hover:bg-background-hover hover:text-foreground"
      >
        <AppIcon name={copied ? "check" : "copy"} className="h-4 w-4" />
        <HoverDetail label={copied ? "Copied" : "Copy"} />
      </button>
    </div>
  )
}
