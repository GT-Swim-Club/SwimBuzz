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
