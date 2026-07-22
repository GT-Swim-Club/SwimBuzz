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
          "w-full max-w-[14rem] truncate text-xs rounded-lg px-3 py-2 border border-border-secondary transition-colors disabled:opacity-50 md:w-auto md:py-1.5 " +
          (selected
            ? "border-primary bg-primary-bg text-primary"
            : "border-border-secondary bg-background text-foreground hover:bg-fill-secondary")
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
          <div className="absolute right-0 z-50 mt-1 w-64 rounded-xl border border-border-secondary bg-background shadow-lg overflow-hidden">
            <div className="p-2 border-b border-border-secondary">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search athletes…"
                autoFocus
                className="w-full rounded-lg border border-border-secondary px-2.5 py-1.5 text-xs bg-background"
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
                    "w-full text-left px-3 py-2 text-xs hover:bg-fill-secondary " +
                    (!selectedAthleteId
                      ? "font-medium text-primary"
                      : "text-foreground")
                  }
                >
                  Coach View
                </button>
              </li>
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-xs text-foreground-tertiary">
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
                        "w-full text-left px-3 py-2 text-xs hover:bg-fill-secondary " +
                        (selectedAthleteId === athlete.id
                          ? "font-medium text-primary"
                          : "text-foreground")
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
