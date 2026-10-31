import { useEffect, useRef, type ReactNode } from "react"
import { LedgerIcon, type LedgerIconName } from "@/components/meet/Ledger"

export function MenuItem({
  icon,
  label,
  selected,
  onClick,
  role = "menuitemradio",
}: {
  icon: LedgerIconName
  label: string
  selected?: boolean
  onClick: () => void
  role?: "menuitem" | "menuitemradio" | "menuitemcheckbox"
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={role === "menuitem" ? undefined : Boolean(selected)}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-[9px] text-left text-sm transition-colors hover:bg-fill ${
        selected ? "text-accent" : "text-foreground"
      }`}
    >
      <LedgerIcon name={icon} className="h-[18px] w-[18px] shrink-0" />
      <span className="flex-1 whitespace-nowrap">{label}</span>
      {selected ? <LedgerIcon name="check" /> : null}
    </button>
  )
}

export function MenuDivider() {
  return <div className="mx-0.5 my-1 h-px bg-border" />
}

export const menuPanel =
  "absolute right-0 top-[calc(100%+6px)] z-[41] flex min-w-[200px] flex-col gap-0.5 rounded-xl border border-border bg-background p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.4)]"

/**
 * A row that opens its options in a flyout to the left (the menu sits at the right edge) on hover,
 * or on click for touch. `open` is the parent's, so only one flyout shows at a time; `onOpenChange(false)`
 * comes a moment after the pointer leaves, so it can cross the gap into the flyout.
 */
export function MenuSubmenu({
  icon,
  label,
  value,
  active,
  open,
  onOpenChange,
  children,
}: {
  icon: LedgerIconName
  label: string
  /** The current choice, after the label ("Sunday Finals", "All"). */
  value: string
  /** A filter other than the default is on: the row reads in gold, like a selected item. */
  active?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }, [])

  function show() {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    onOpenChange(true)
  }
  function scheduleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => onOpenChange(false), 150)
  }

  return (
    <div className="relative" onMouseEnter={show} onMouseLeave={scheduleClose}>
      <button
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? onOpenChange(false) : show())}
        className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-[9px] text-left text-sm transition-colors hover:bg-fill ${
          open ? "bg-fill" : ""
        } ${active ? "text-accent" : "text-foreground"}`}
      >
        <LedgerIcon name={icon} className="h-[18px] w-[18px] shrink-0" />
        <span className="whitespace-nowrap">{label}</span>
        <span
          className={`ml-auto max-w-[160px] truncate pl-3 text-right ${active ? "text-accent" : "text-foreground-tertiary"}`}
        >
          {value}
        </span>
        <LedgerIcon name="chevronRight" className="h-4 w-4 shrink-0 text-foreground-tertiary" />
      </button>
      {open ? (
        <div role="menu" className={submenuPanel}>
          {children}
        </div>
      ) : null}
    </div>
  )
}

const submenuPanel =
  "absolute right-[calc(100%+12px)] top-[-6px] z-[42] flex min-w-[200px] flex-col gap-0.5 rounded-xl border border-border bg-background p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
