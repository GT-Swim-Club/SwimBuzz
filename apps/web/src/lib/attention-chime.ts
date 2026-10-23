"use client"

/** A short two-note chime that calls the user back to the app; synthesized, so there's no audio file to ship. */

let context: AudioContext | null = null

function audioContext(): AudioContext | null {
  if (typeof window === "undefined" || !("AudioContext" in window)) return null
  context ??= new AudioContext()
  return context
}

/**
 * Call from a user gesture (e.g. starting an import). Browsers keep audio suspended until the page
 * is interacted with, and a chime played later from a background tab can't unlock it itself.
 */
export function primeAttentionChime() {
  audioContext()?.resume().catch(() => {})
}

export function playAttentionChime() {
  const ctx = audioContext()
  if (!ctx) return
  ctx.resume().catch(() => {})
  const start = ctx.currentTime + 0.02
  ;[880, 1318.5].forEach((frequency, i) => {
    const at = start + i * 0.18
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = "sine"
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(0.25, at + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.6)
    oscillator.connect(gain).connect(ctx.destination)
    oscillator.start(at)
    oscillator.stop(at + 0.65)
  })
}

/** Whether the user is looking at this tab right now: visible, and its window focused. */
export function isPageInView(): boolean {
  return document.visibilityState === "visible" && document.hasFocus()
}
