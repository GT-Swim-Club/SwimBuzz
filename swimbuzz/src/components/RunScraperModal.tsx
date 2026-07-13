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
    <div className="mt-4 flex rounded-lg border dark:border-zinc-700 p-0.5 bg-gray-50 dark:bg-zinc-950">
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
              ? "bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 shadow-sm"
              : "text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-300"
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
              className="rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 dark:border-zinc-700 disabled:opacity-50"
            >
              {terminating ? "Terminating…" : "Terminate scraper"}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Done
          </button>
        </ModalFooter>
      }
    >
      <div className="space-y-4 text-sm">
        <div
          className={`rounded-lg border px-4 py-3 ${
            connected
              ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
              : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
          }`}
        >
          {loading
            ? "Checking status…"
            : connected
              ? "The scraper is running. You can now import data."
              : "The scraper is not running."}
        </div>

        {installed === false && (
          <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
            <p className="font-medium text-gray-900 dark:text-zinc-100">One-time setup</p>
            <p className="text-gray-600 dark:text-zinc-400">
              Downloads the scraper via <code className="text-xs">uv</code>.
              {platform === "windows" ? " Run in PowerShell." : " Run in Terminal."}
            </p>
            <pre className="overflow-x-auto rounded-md bg-white p-3 text-xs text-gray-800 dark:bg-zinc-950 dark:text-zinc-200 whitespace-pre-wrap break-all">
              {installCommand}
            </pre>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => void copyText(installCommand)}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
              >
                Copy install command
              </button>
              <button
                type="button"
                onClick={markInstalled}
                className="text-xs font-medium text-gray-600 hover:text-gray-800 dark:text-zinc-400"
              >
                I&apos;ve installed it
              </button>
            </div>
          </div>
        )}

        <ol className="list-decimal space-y-2 pl-5 text-gray-700 dark:text-zinc-300">
          {installed === false && <li>Run the one-time install command above.</li>}
          <li>Generate the run command below (valid for 15 minutes).</li>
          <li>Copy it into your terminal and leave it running.</li>
          <li>Import SwimCloud IDs &amp; times, SwimPhone results, meet PDFs</li>
        </ol>

        {installed && (
          <button
            type="button"
            onClick={() => setInstalled(false)}
            className="text-xs text-gray-500 hover:text-gray-700 dark:text-zinc-400"
          >
            Show install instructions again
          </button>
        )}

        {!pairing ? (
          <button
            type="button"
            onClick={() => void generateCode()}
            disabled={pairingLoading}
            className="w-full rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-gray-50 dark:hover:bg-zinc-800 dark:border-zinc-700 disabled:opacity-50"
          >
            {pairingLoading ? "Generating…" : "Generate run command"}
          </button>
        ) : (
          <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-zinc-700 dark:bg-zinc-900/50">
            <p className="text-xs text-gray-500 dark:text-zinc-500">
              Expires {new Date(pairing.expiresAt).toLocaleTimeString()}
            </p>
            <pre className="overflow-x-auto rounded-md bg-white p-3 text-xs text-gray-800 dark:bg-zinc-950 dark:text-zinc-200 whitespace-pre-wrap break-all">
              {runCommand}
            </pre>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => void copyText(runCommand)}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
              >
                Copy command
              </button>
              <button
                type="button"
                onClick={() => void generateCode()}
                disabled={pairingLoading}
                className="text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-zinc-400"
              >
                Generate new command
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </Modal>
  )
}
