"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import HoverDetail from "@/components/HoverDetail"
import {
  ATHLETE_VIEW_COOKIE,
  athleteViewCookieValue,
} from "@/lib/athlete-view"

const MAX_AGE_SECONDS = 60 * 60 * 24 * 30

type AthleteOption = { id: string; name: string }

function AthleteViewIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
    >
      <path d="M4 9.25h16" />
      <path d="M7.5 9.25 9 4h6l1.5 5.25" />
      <path d="M8.25 10.5v1.75a3.75 3.75 0 0 0 7.5 0V10.5" />
      <path d="M8.25 11.75c1.05-.55 2.3-.8 3.75-.8s2.7.25 3.75.8" />
      <path d="M4.75 21 7.25 15.5 12 19.5l4.75-4L19.25 21" />
      <path d="M9.25 17.25 12 19.5l2.75-2.25" />
    </svg>
  )
}
export default function AthleteViewToggle({
  athletes,
  selectedAthleteId,
  compact = false,
}: {
  athletes: AthleteOption[]
  selectedAthleteId: string | null
  compact?: boolean
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
        aria-label={compact ? "Athlete View" : undefined}
        title={selected ? `Previewing as ${selected.name}. Click to change or exit.` : "Preview the app as a specific athlete"}
        className={
          "group relative inline-flex h-9 items-center justify-center rounded-lg border border-border-secondary transition-colors disabled:opacity-50 " +
          (compact ? "w-9" : "max-w-[14rem] gap-2 px-3 text-xs") +
          (selected
            ? " border-primary bg-primary-bg text-primary"
            : " bg-background text-foreground hover:bg-fill-secondary")
        }
      >
        <AthleteViewIcon />
        {compact ? <HoverDetail label="Athlete View" /> : null}
        {!compact ? <span className="truncate">{selected ? `As ${selected.name}` : "Athlete View"}</span> : null}
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
