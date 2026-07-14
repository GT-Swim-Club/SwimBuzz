"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import {
  ATHLETE_VIEW_COOKIE,
  athleteViewCookieValue,
} from "@/lib/athlete-view"

const MAX_AGE_SECONDS = 60 * 60 * 24 * 30

type AthleteOption = { id: string; name: string }

export default function AthleteViewToggle({
  athletes,
  selectedAthleteId,
}: {
  athletes: AthleteOption[]
  selectedAthleteId: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return athletes
    return athletes.filter((a) => a.name.toLowerCase().includes(q))
  }, [athletes, query])

  const selected = selectedAthleteId
    ? athletes.find((a) => a.id === selectedAthleteId) ?? null
    : null

  function setPreviewAthlete(athleteId: string | null) {
    document.cookie = `${ATHLETE_VIEW_COOKIE}=${athleteViewCookieValue(athleteId)}; path=/; max-age=${MAX_AGE_SECONDS}; SameSite=Lax`
    setOpen(false)
    setQuery("")
    startTransition(() => {
      router.refresh()
    })
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        aria-expanded={open}
        aria-haspopup="listbox"
        title={
          selected
            ? `Previewing as ${selected.name}. Click to change or exit.`
            : "Preview the app as a specific athlete"
        }
        className={
          "max-w-[14rem] truncate text-xs rounded-lg px-2.5 py-1 border transition-colors disabled:opacity-50 " +
          (selected
            ? "border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200"
            : "border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800")
        }
      >
        {selected ? `As ${selected.name}` : "Athlete View"}
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close athlete picker"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => {
              setOpen(false)
              setQuery("")
            }}
          />
          <div className="absolute right-0 z-50 mt-1 w-64 rounded-xl border border-gray-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900 overflow-hidden">
            <div className="p-2 border-b dark:border-zinc-800">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search athletes…"
                autoFocus
                className="w-full rounded-lg border px-2.5 py-1.5 text-xs dark:bg-zinc-950 dark:border-zinc-700"
              />
            </div>
            <ul className="max-h-64 overflow-y-auto py-1 text-sm" role="listbox">
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={!selectedAthleteId}
                  onClick={() => setPreviewAthlete(null)}
                  className={
                    "w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-zinc-800 " +
                    (!selectedAthleteId
                      ? "font-medium text-indigo-700 dark:text-indigo-300"
                      : "text-gray-700 dark:text-zinc-300")
                  }
                >
                  Coach View
                </button>
              </li>
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-xs text-gray-400 dark:text-zinc-500">
                  No matches
                </li>
              ) : (
                filtered.map((athlete) => (
                  <li key={athlete.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selectedAthleteId === athlete.id}
                      onClick={() => setPreviewAthlete(athlete.id)}
                      className={
                        "w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-zinc-800 " +
                        (selectedAthleteId === athlete.id
                          ? "font-medium text-indigo-700 dark:text-indigo-300"
                          : "text-gray-700 dark:text-zinc-300")
                      }
                    >
                      {athlete.name}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  )
}
