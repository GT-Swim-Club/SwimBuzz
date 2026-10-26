"use client"

import { useRef, useState } from "react"
import { playAttentionChime } from "@/lib/attention-chime"
import { updateAlertSound } from "./settings.actions"

export default function AlertSoundSettings({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [error, setError] = useState<string | null>(null)
  const lastSaved = useRef(initialEnabled)
  const requestGen = useRef(0)

  function toggle() {
    const next = !enabled
    setEnabled(next)
    setError(null)
    // Preview the sound, which also unlocks audio for this tab.
    if (next) playAttentionChime()
    const gen = ++requestGen.current

    void (async () => {
      try {
        const saved = await updateAlertSound(next)
        if (requestGen.current !== gen) return
        lastSaved.current = saved
      } catch (err) {
        if (requestGen.current !== gen) return
        setEnabled(lastSaved.current)
        setError(err instanceof Error ? err.message : "Couldn’t save sound setting")
      }
    })()
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div>
          <p className="text-sm text-foreground">Cloudflare check sound</p>
          <p className="text-xs text-foreground-secondary">
            Play a chime when an import needs a Cloudflare check or verification and you’re in another tab
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Cloudflare check sound"
          onClick={toggle}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            enabled ? "bg-primary" : "bg-fill-secondary"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full shadow transition-transform ${
              enabled ? "bg-background translate-x-5" : "bg-primary translate-x-0"
            }`}
          />
        </button>
      </div>
      {error ? <p className="px-4 py-2 text-xs text-error">{error}</p> : null}
    </div>
  )
}
