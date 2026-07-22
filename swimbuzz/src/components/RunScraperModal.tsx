"use client"

import { useEffect, useState } from "react"
import Modal, { ModalFooter } from "@/components/Modal"

type Pairing = {
  code: string
  expiresAt: string
}

type Platform = "mac" | "windows"

function bridgeCommands(appUrl: string, code?: string) {
  const macInstall = `curl -fsSL ${appUrl}/bridge/install.sh | bash -s -- ${appUrl}`
  const macRun = code
    ? `~/.local/bin/swimbuzz-bridge --url ${appUrl} --code ${code}`
    : ""

  const winInstallPortable = `curl.exe -fsSL ${appUrl}/bridge/install.ps1 -o $env:TEMP\\swimbuzz-install.ps1; powershell -NoProfile -ExecutionPolicy Bypass -File $env:TEMP\\swimbuzz-install.ps1 -AppUrl ${appUrl}`
  const winRun = code
    ? `& "$env:USERPROFILE\\.local\\bin\\swimbuzz-bridge.cmd" --url ${appUrl} --code ${code}`
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

  const appUrl =
    typeof window !== "undefined" ? window.location.origin : "https://swimbuzz.onrender.com"

  const commands = bridgeCommands(appUrl, pairing?.code)
  const installCommand = commands[platform].install
  const runCommand = commands[platform].run

  useEffect(() => {
    if (!open) return
    setError(null)
    void refresh()
    setInstalled(localStorage.getItem("swimbuzz-bridge-installed") === "1")
    const saved = localStorage.getItem("swimbuzz-bridge-platform")
    if (saved === "mac" || saved === "windows") setPlatform(saved)
  }, [open, refresh])

  function setPlatformAndSave(next: Platform) {
    setPlatform(next)
    localStorage.setItem("swimbuzz-bridge-platform", next)
  }

  async function generateCode() {
    setPairingLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/bridge/pairing", { method: "POST" })
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
      await fetch("/api/bridge/status", { method: "DELETE" })
      setPairing(null)
      await refresh()
    } catch {
      setError("Could not terminate scraper")
    } finally {
      setTerminating(false)
    }
  }

  async function copyText(text: string) {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // ignore
    }
  }

  function markInstalled() {
    localStorage.setItem("swimbuzz-bridge-installed", "1")
    setInstalled(true)
  }

  const platformToggle = (
    <div className="mt-4 flex rounded-lg border border-border-secondary p-0.5 bg-background">
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
          className={`flex flex-1 items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            platform === value
              ? "bg-background-elevated text-foreground shadow-sm"
              : "text-foreground-secondary hover:text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Run the Scraper"
      description="Install the scraper once, and then run it whenever importing data."
      maxWidth="lg"
      header={platformToggle}
      footer={
        <ModalFooter>
          {connected && (
            <button
              type="button"
              onClick={() => void terminateScraper()}
              disabled={terminating}
              className="rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary disabled:opacity-50"
            >
              {terminating ? "Terminating…" : "Terminate scraper"}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-text hover:bg-primary-hover"
          >
            Done
          </button>
        </ModalFooter>
      }
    >
      <div className="space-y-4 text-sm">
        <div
          className={`rounded-lg border border-border-secondary px-4 py-3 ${
            connected
              ? "border-success bg-success-bg text-success"
              : "border-warning bg-warning-bg text-warning"
          }`}
        >
          {loading
            ? "Checking status…"
            : connected
              ? "The scraper is running. You can now import data."
              : "The scraper is not running."}
        </div>

        {installed === false && (
          <div className="space-y-2 rounded-lg border border-border-secondary bg-fill-secondary p-4">
            <p className="font-medium text-foreground">One-time setup</p>
            <p className="text-foreground-secondary">
              Downloads the scraper via <code className="text-xs">uv</code>.
              {platform === "windows" ? " Run in PowerShell." : " Run in Terminal."}
            </p>
            <pre className="overflow-x-auto rounded-md bg-background-elevated p-3 text-xs text-foreground whitespace-pre-wrap break-all">
              {installCommand}
            </pre>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => void copyText(installCommand)}
                className="text-xs font-medium text-primary hover:text-primary-hover"
              >
                Copy install command
              </button>
              <button
                type="button"
                onClick={markInstalled}
                className="text-xs font-medium text-foreground-secondary hover:text-foreground"
              >
                I&apos;ve installed it
              </button>
            </div>
          </div>
        )}

        <ol className="list-decimal space-y-2 pl-5 text-foreground">
          {installed === false && <li>Run the one-time install command above.</li>}
          <li>Generate the run command below (valid for 15 minutes).</li>
          <li>Copy it into your terminal and leave it running.</li>
          <li>Import SwimCloud IDs &amp; times, SwimPhone results, meet PDFs</li>
        </ol>

        {installed && (
          <button
            type="button"
            onClick={() => setInstalled(false)}
            className="text-xs text-foreground-secondary hover:text-foreground"
          >
            Show install instructions again
          </button>
        )}

        {!pairing ? (
          <button
            type="button"
            onClick={() => void generateCode()}
            disabled={pairingLoading}
            className="w-full rounded-lg border border-border-secondary px-4 py-2.5 text-sm font-medium hover:bg-fill-secondary disabled:opacity-50"
          >
            {pairingLoading ? "Generating…" : "Generate run command"}
          </button>
        ) : (
          <div className="space-y-3 rounded-lg border border-border-secondary bg-fill-secondary p-4">
            <p className="text-xs text-foreground-secondary">
              Expires {new Date(pairing.expiresAt).toLocaleTimeString()}
            </p>
            <pre className="overflow-x-auto rounded-md bg-background-elevated p-3 text-xs text-foreground whitespace-pre-wrap break-all">
              {runCommand}
            </pre>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => void copyText(runCommand)}
                className="text-xs font-medium text-primary hover:text-primary-hover"
              >
                Copy command
              </button>
              <button
                type="button"
                onClick={() => void generateCode()}
                disabled={pairingLoading}
                className="text-xs font-medium text-foreground-secondary hover:text-foreground"
              >
                Generate new command
              </button>
            </div>
          </div>
        )}

        <p className="text-sm text-error">{error}</p>
      </div>
    </Modal>
  )
}
