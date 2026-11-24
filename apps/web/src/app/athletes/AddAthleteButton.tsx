"use client"

import { useState, type ReactNode } from "react"
import { useSearchParams } from "next/navigation"
import { currentSeason, parseSeason } from "@/lib/season"
import HoverDetail from "@/components/ui/HoverDetail"
import AddAthleteDialog from "@/components/athlete/AddAthleteDialog"

export default function AddAthleteButton({
  trigger,
}: {
  /** Custom trigger (e.g. a menu item); receives the function that opens the dialog. */
  trigger?: (open: () => void) => ReactNode
} = {}) {
  const searchParams = useSearchParams()

  // The roster's gender filter picks the gender; with "All" the coach chooses one.
  const genderParam = searchParams.get("gender")
  const gender = genderParam === "F" || genderParam === "M" ? genderParam : null
  const season =
    parseSeason(searchParams.get("season") ?? searchParams.get("year")) ?? currentSeason()

  const [open, setOpen] = useState(false)
  const openModal = () => setOpen(true)

  return (
    <>
      {trigger ? trigger(openModal) : (
        <button
          type="button"
          onClick={openModal}
          aria-label="Add athlete"
          className="group relative inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg bg-primary text-primary-contrast transition-colors hover:bg-primary-hover"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 shrink-0"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <HoverDetail label="Add athlete" />
        </button>
      )}

      <AddAthleteDialog open={open} onClose={() => setOpen(false)} season={season} initial={{ gender }} />
    </>
  )
}
