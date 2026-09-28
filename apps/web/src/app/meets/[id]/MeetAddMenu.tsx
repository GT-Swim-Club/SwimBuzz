"use client"

import { useEffect, useState } from "react"
import { LedgerIcon } from "@/components/meet/Ledger"
import type { SheetEntry } from "@/lib/meet/meet-sheet-summary"
import AddToRosterSummaryButton from "./AddToRosterSummaryButton"
import AddResultButton from "./AddResultButton"
import AddIndividualEntryButton from "./AddIndividualEntryButton"
import { MenuItem, menuPanel } from "./MeetMenu"

const triggerClass = {
  toolbar:
    "inline-flex h-[38px] w-[38px] cursor-pointer items-center justify-center rounded-lg border border-border bg-background text-foreground transition-colors hover:bg-fill",
  ledger:
    "inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-background text-foreground transition-colors hover:bg-fill",
}

const iconClass = {
  toolbar: "h-[18px] w-[18px] shrink-0",
  ledger: "h-3.5 w-3.5 shrink-0",
}

/** Coach "+" menu: add an athlete to the roster, a swim, or an individual entry. */
export default function MeetAddMenu({
  meetId,
  meetName,
  defaultCourse,
  defaultDate,
  athletes,
  rosterSummaryEntries,
  onOpen,
  variant = "toolbar",
}: {
  meetId: string
  meetName: string
  defaultCourse: string
  defaultDate: string
  athletes: { id: string; name: string; gender?: "M" | "F" }[]
  rosterSummaryEntries: SheetEntry[]
  /** Called when the menu opens, e.g. to close a sibling menu. */
  onOpen?: () => void
  /** "toolbar" matches the roster summary toolbar; "ledger" matches ledger card icon buttons. */
  variant?: "toolbar" | "ledger"
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label="Add"
        title="Add"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (!open) onOpen?.()
          setOpen(!open)
        }}
        className={triggerClass[variant]}
      >
        <LedgerIcon name="plus" className={iconClass[variant]} />
      </button>
      {/* Kept mounted while closed so each item's dialog survives the menu closing. */}
      {open ? <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} /> : null}
      <div role="menu" className={`${menuPanel} ${open ? "" : "hidden"}`}>
        <AddToRosterSummaryButton
          meetId={meetId}
          athletes={athletes}
          rosterSummaryEntries={rosterSummaryEntries}
          trigger={(openDialog) => (
            <MenuItem
              role="menuitem"
              icon="userPlus"
              label="Add to roster"
              onClick={() => {
                setOpen(false)
                openDialog()
              }}
            />
          )}
        />
        <AddResultButton
          meetId={meetId}
          meetName={meetName}
          defaultCourse={defaultCourse}
          defaultDate={defaultDate}
          athletes={athletes}
          trigger={(openDialog) => (
            <MenuItem
              role="menuitem"
              icon="swim"
              label="Add swim"
              onClick={() => {
                setOpen(false)
                openDialog()
              }}
            />
          )}
        />
        <AddIndividualEntryButton
          meetId={meetId}
          athletes={athletes}
          trigger={(openDialog) => (
            <MenuItem
              role="menuitem"
              icon="fileNew"
              label="Add entry"
              onClick={() => {
                setOpen(false)
                openDialog()
              }}
            />
          )}
        />
      </div>
    </div>
  )
}
