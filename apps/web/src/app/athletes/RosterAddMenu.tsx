"use client"

import { useState, type ReactNode } from "react"
import { AppIcon } from "@/components/ui/AppIcon"
import HoverDetail from "@/components/ui/HoverDetail"
import { LedgerIcon } from "@/components/meet/Ledger"
import { menuPanel } from "@/app/meets/[id]/MeetMenu"
import { useEscapeToClose } from "@/lib/use-escape-to-close"
import ImportRosterButton from "./ImportRosterButton"
import SyncTimesButton from "./SyncTimesButton"
import AddAthleteButton from "./AddAthleteButton"
import ClearanceImportItems from "./ClearanceImportItems"

function MenuRow({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-2.5 py-[9px] text-left text-sm text-foreground transition-colors hover:bg-fill"
    >
      {icon}
      <span className="flex-1 whitespace-nowrap">{label}</span>
    </button>
  )
}

const ICON_CLASS = "h-[18px] w-[18px] shrink-0"

/** Coach "+" menu on the roster: import the roster, times, physicals or concussion tests, or add an athlete. */
export default function RosterAddMenu({ season }: { season: string }) {
  const [open, setOpen] = useState(false)

  useEscapeToClose(open, () => setOpen(false))

  /** Close the menu, then open the item's dialog. */
  const choose = (openDialog: () => void) => () => {
    setOpen(false)
    openDialog()
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label="Add"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="group relative inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg bg-primary text-primary-contrast transition-colors hover:bg-primary-hover"
      >
        <LedgerIcon name="plus" className="h-4 w-4 shrink-0" />
        {!open && <HoverDetail label="Add" />}
      </button>
      {/* Kept mounted while closed so each item's dialog survives the menu closing. */}
      {open ? <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} /> : null}
      {/* As wide as its longest item, not the shared menu's 200px minimum. */}
      <div role="menu" className={`${menuPanel.replace("min-w-[200px]", "w-max")} ${open ? "" : "hidden"}`}>
        <ImportRosterButton
          trigger={(openDialog) => (
            <MenuRow icon={<LedgerIcon name="import" className={ICON_CLASS} />} label="Import roster" onClick={choose(openDialog)} />
          )}
        />
        <SyncTimesButton
          trigger={(openDialog) => (
            <MenuRow icon={<AppIcon name="stopwatch" className={ICON_CLASS} />} label="Import times" onClick={choose(openDialog)} />
          )}
        />
        <ClearanceImportItems
          season={season}
          trigger={(item, openDialog) => (
            <MenuRow icon={<AppIcon name={item.icon} className={ICON_CLASS} />} label={item.label} onClick={choose(openDialog)} />
          )}
        />
        <AddAthleteButton
          trigger={(openDialog) => (
            <MenuRow icon={<LedgerIcon name="userPlus" className={ICON_CLASS} />} label="Add athlete" onClick={choose(openDialog)} />
          )}
        />
      </div>
    </div>
  )
}
