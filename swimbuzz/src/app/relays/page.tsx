"use client"

import { useState } from "react"
import { formatTime } from "@/lib/utils"
import { Gender } from "@prisma/client"

const RELAY_EVENTS = [
  "200 Free Relay",
  "400 Free Relay",
  "800 Free Relay",
  "200 Medley Relay",
  "400 Medley Relay",
]

const LEG_ORDER: Record<string, string[]> = {
  "200 Free Relay":   ["free", "free", "free", "free"],
  "400 Free Relay":   ["free", "free", "free", "free"],
  "800 Free Relay":   ["free", "free", "free", "free"],
  "200 Medley Relay": ["back", "breast", "fly", "free"],
  "400 Medley Relay": ["back", "breast", "fly", "free"],
}

type Leg = {
  leg?: string
  name: string
  event: string
  timeMs: number
  athleteId: string
}

type RelayResult = {
  relay: string
  course: string
  totalMs: number
  legs: Leg[]
  alternates?: Leg[]
}

export default function RelayBuilderPage() {
  const [event, setEvent] = useState("400 Free Relay")
  const [course, setCourse] = useState("SCY")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<RelayResult | null>(null)
  const [error, setError] = useState("")
  const [gender, setGender] = useState("M")

  async function handleBuild() {
    setLoading(true)
    setError("")
    setResult(null)

    const res = await fetch("/api/relays/optimal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ relayEvent: event, course, gender }),
    })

    const data = await res.json()
    if (res.ok) {
      setResult(data)
    } else {
      setError(data.error ?? "Something went wrong")
    }
    setLoading(false)
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-medium">Relay builder</h1>

      {/* Controls */}
      <div className="flex gap-3 items-end">
        <div>
            <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">Gender</label>
            <select
                value={gender}
                onChange={e => setGender(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm"
            >
                <option value="M">Men</option>
                <option value="F">Women</option>
                {!event.includes("Medley") && <option value="X">Mixed</option>}
            </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">Event</label>
          <select
            value={event}
            onChange={e => setEvent(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            {RELAY_EVENTS
                .filter(e => gender === "X" ? !e.includes("Medley") : true)
                .map(e => <option key={e}>{e}</option>)
            }
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-zinc-400 mb-1 block">Course</label>
          <select
            value={course}
            onChange={e => setCourse(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option>SCY</option>
            <option>LCM</option>
            <option>SCM</option>
          </select>
        </div>
        <button
          onClick={handleBuild}
          disabled={loading}
          className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-950 disabled:opacity-40 transition-colors"
        >
          {loading ? "Building..." : "Build relay"}
        </button>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* Result */}
      {result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">{result.relay} — {result.course}</h2>
            <span className="text-xl font-mono font-medium">
              {formatTime(result.totalMs)}
            </span>
          </div>

          {/* Legs */}
          <div className="border rounded-xl overflow-hidden divide-y">
            {result.legs.map((leg, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3 bg-white dark:bg-zinc-900">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-medium flex items-center justify-center">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{leg.name}</p>
                    <p className="text-xs text-gray-500 dark:text-zinc-400">{leg.event}</p>
                  </div>
                </div>
                <span className="font-mono text-sm">{formatTime(leg.timeMs)}</span>
              </div>
            ))}
          </div>

          {/* Alternates */}
          {result.alternates && result.alternates.length > 0 && (
            <div>
              <h3 className="text-xs text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-2">Alternates</h3>
              <div className="border rounded-xl overflow-hidden divide-y">
                {result.alternates.map((alt, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2 bg-white dark:bg-zinc-900 text-sm">
                    <span className="text-gray-500 dark:text-zinc-300">{alt.name}</span>
                    <span className="font-mono text-gray-500 dark:text-zinc-300">{formatTime(alt.timeMs)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  )
}