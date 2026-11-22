"use client"

import { useState } from "react"
import { LedgerIcon } from "@/components/meet/Ledger"
import HoverDetail from "@/components/ui/HoverDetail"
import { toolbarIconButtonClass } from "@/components/ui/FluidToolbar"
import { MenuItem, MenuSubmenu, menuPanel } from "@/app/meets/[id]/MeetMenu"
import { useEscapeToClose } from "@/lib/use-escape-to-close"
import {
  CLEARANCE_OPTIONS,
  GENDER_OPTIONS,
  rosterFilterLabel as label,
  rosterFiltersActive,
  SWIMCLOUD_OPTIONS,
  type RosterFilters,
} from "@/lib/roster/roster-filters"

type Submenu = "gender" | "clearance" | "swimcloud"

/**
 * Roster "Filters" menu (gear): gender for everyone, plus clearance and SwimCloud status for staff.
 * The gear turns gold while any filter is on.
 */
export default function RosterFilterMenu({
  filters,
  staff,
  onChange,
}: {
  filters: RosterFilters
  staff: boolean
  onChange: (key: keyof RosterFilters, value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [submenu, setSubmenu] = useState<Submenu | null>(null)

  useEscapeToClose(open, () => setOpen(false))

  const submenuProps = (key: Submenu) => ({
    open: submenu === key,
    onOpenChange: (next: boolean) => setSubmenu((cur) => (next ? key : cur === key ? null : cur)),
  })

  function choose(key: keyof RosterFilters, value: string) {
    onChange(key, value)
    setOpen(false)
  }

  const active = rosterFiltersActive(filters)

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label="Filters"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o)
          setSubmenu(null)
        }}
        className={`${toolbarIconButtonClass} ${active ? "text-accent" : ""}`}
      >
        <LedgerIcon name="settings" className="h-[18px] w-[18px] shrink-0" />
        {!open && <HoverDetail label="Filters" />}
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div role="menu" className={menuPanel}>
            <MenuSubmenu
              icon="users"
              label="Gender"
              value={label(GENDER_OPTIONS, filters.gender)}
              active={filters.gender !== "all"}
              {...submenuProps("gender")}
            >
              {GENDER_OPTIONS.map(([value, text]) => (
                <MenuItem
                  key={value}
                  icon="users"
                  label={text}
                  selected={filters.gender === value}
                  onClick={() => choose("gender", value)}
                />
              ))}
            </MenuSubmenu>
            {staff && (
              <>
                <MenuSubmenu
                  icon="clipboardCheck"
                  label="Clearance"
                  value={label(CLEARANCE_OPTIONS, filters.clearance)}
                  active={filters.clearance !== "all"}
                  {...submenuProps("clearance")}
                >
                  {CLEARANCE_OPTIONS.map(([value, text]) => (
                    <MenuItem
                      key={value}
                      icon="clipboardCheck"
                      label={text}
                      selected={filters.clearance === value}
                      onClick={() => choose("clearance", value)}
                    />
                  ))}
                </MenuSubmenu>
                <MenuSubmenu
                  icon="swim"
                  label="SwimCloud"
                  value={label(SWIMCLOUD_OPTIONS, filters.swimcloud)}
                  active={filters.swimcloud !== "all"}
                  {...submenuProps("swimcloud")}
                >
                  {SWIMCLOUD_OPTIONS.map(([value, text]) => (
                    <MenuItem
                      key={value}
                      icon="swim"
                      label={text}
                      selected={filters.swimcloud === value}
                      onClick={() => choose("swimcloud", value)}
                    />
                  ))}
                </MenuSubmenu>
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}
