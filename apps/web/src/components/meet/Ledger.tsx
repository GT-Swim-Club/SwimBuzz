import Link from "next/link"
import type { ReactNode } from "react"

const LEDGER_ICONS = {
  clipboardCheck: (
    <>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="m9 14 2 2 4-4" />
    </>
  ),
  file: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </>
  ),
  fileList: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8" />
      <path d="M8 17h8" />
    </>
  ),
  fileAdd: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h9" />
      <path d="M14 2v6h6" />
      <path d="M16 19h6" />
      <path d="M19 16v6" />
    </>
  ),
  fileNew: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M12 18v-6" />
      <path d="M9 15h6" />
    </>
  ),
  listOrdered: (
    <>
      <path d="M10 6h11" />
      <path d="M10 12h11" />
      <path d="M10 18h11" />
      <path d="M4 6h1v4" />
      <path d="M4 14h1v4" />
    </>
  ),
  chart: (
    <>
      <path d="M3 3v18h18" />
      <path d="M7 16l4-8 4 5 4-9" />
    </>
  ),
  lanes: (
    <>
      <path d="M4 3v18" />
      <path d="M10 3v18" />
      <path d="M16 3v18" />
      <path d="M22 3v18" />
    </>
  ),
  trophy: (
    <>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </>
  ),
  broadcast: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M16.24 7.76a6 6 0 0 1 0 8.49" />
      <path d="M7.76 16.24a6 6 0 0 1 0-8.49" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      <path d="M4.93 19.07a10 10 0 0 1 0-14.14" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  userPlus: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6" />
      <path d="M22 11h-6" />
    </>
  ),
  user: (
    <>
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  swim: (
    <>
      <path d="M2 16c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0" />
      <path d="M2 20c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0" />
      <path d="M8 12l3-7 3 3-2 4" />
      <circle cx="17" cy="5" r="1.5" />
    </>
  ),
  car: (
    <>
      <path d="M5 17h14" />
      <path d="M5 17a2 2 0 0 1-2-2v-2a2 2 0 0 1 .4-1.2L5 9h14l1.6 2.8a2 2 0 0 1 .4 1.2v2a2 2 0 0 1-2 2" />
      <path d="M5 17v2a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-2" />
      <path d="M16 17v2a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-2" />
      <circle cx="7.5" cy="14" r="0.5" />
      <circle cx="16.5" cy="14" r="0.5" />
    </>
  ),
  rooms: (
    <>
      <path d="M2 20h20" />
      <path d="M4 20V10a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v10" />
      <path d="M9 20v-4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4" />
      <path d="M7 9V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v4" />
    </>
  ),
  bed: (
    <>
      <path d="M2 4v16" />
      <path d="M2 8h18a2 2 0 0 1 2 2v10" />
      <path d="M2 17h20" />
      <path d="M6 8v9" />
    </>
  ),
  hotel: (
    <>
      <path d="M2 21V6a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v15" />
      <path d="M17 11h3a2 2 0 0 1 2 2v8" />
      <path d="M2 21h20" />
      <path d="M6 8h2" />
      <path d="M6 12h2" />
      <path d="M6 16h2" />
    </>
  ),
  suitcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M3 12h18" />
    </>
  ),
  itinerary: (
    <>
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 14h.01" />
      <path d="M12 14h4" />
      <path d="M8 18h.01" />
      <path d="M12 18h4" />
    </>
  ),
  calendar: (
    <>
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
    </>
  ),
  pencil: <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />,
  download: (
    <>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M4 19h16" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </>
  ),
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  externalLink: (
    <>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </>
  ),
  numberedList: (
    <>
      <path d="M10 6h11" />
      <path d="M10 12h11" />
      <path d="M10 18h11" />
      <path d="M4 6h1v4" />
      <path d="M4 10h2" />
      <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
    </>
  ),
  rowsCozy: (
    <>
      <rect x="3" y="4" width="18" height="7" rx="1" />
      <rect x="3" y="13" width="18" height="7" rx="1" />
    </>
  ),
  rowsCompact: (
    <>
      <path d="M3 5h18" />
      <path d="M3 10h18" />
      <path d="M3 15h18" />
      <path d="M3 20h18" />
    </>
  ),
  flag: (
    <>
      <path d="M4 22V4" />
      <path d="M4 4h13l-2 4 2 4H4" />
    </>
  ),
  settings: (
    <>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
} as const

export type LedgerIconName = keyof typeof LEDGER_ICONS

export function LedgerIcon({
  name,
  className = "h-4 w-4 shrink-0",
}: {
  name: LedgerIconName
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {LEDGER_ICONS[name]}
    </svg>
  )
}

/** Bordered sidebar card with a title row and optional divided link rows. */
export function LedgerCard({
  title,
  aside,
  children,
}: {
  title: string
  aside?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background">
      <div className="flex min-h-[3.25rem] flex-wrap items-center justify-between gap-2 px-4 py-3">
        <span className="text-sm font-semibold text-foreground">{title}</span>
        {aside}
      </div>
      {children}
    </div>
  )
}

export const ledgerRowClass =
  "flex w-full items-center justify-between gap-3 border-t border-border px-4 py-[11px] text-left text-sm text-foreground transition-colors hover:text-primary"

export function LedgerRowBody({ icon, label, trailing }: { icon: LedgerIconName; label: ReactNode; trailing?: ReactNode }) {
  return (
    <>
      <span className="inline-flex min-w-0 items-center gap-2.5">
        <LedgerIcon name={icon} className="h-4 w-4 shrink-0 text-foreground-tertiary" />
        <span className="truncate">{label}</span>
      </span>
      {trailing ?? (
        <span aria-hidden className="text-foreground-quaternary">
          ›
        </span>
      )}
    </>
  )
}

/** One link/button row inside a LedgerCard. */
export function LedgerRow({
  icon,
  label,
  href,
  external = false,
  onClick,
  trailing,
}: {
  icon: LedgerIconName
  label: ReactNode
  href?: string
  external?: boolean
  onClick?: () => void
  trailing?: ReactNode
}) {
  const isExternal = Boolean(href && external)
  const body = (
    <LedgerRowBody
      icon={icon}
      label={label}
      trailing={
        trailing ??
        (isExternal ? (
          <LedgerIcon name="externalLink" className="h-3.5 w-3.5 shrink-0 text-foreground-quaternary" />
        ) : undefined)
      }
    />
  )
  if (href && external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={ledgerRowClass}>
        {body}
      </a>
    )
  }
  if (href) {
    return (
      <Link href={href} className={ledgerRowClass}>
        {body}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={`${ledgerRowClass} cursor-pointer`}>
      {body}
    </button>
  )
}

/** Non-interactive note row inside a LedgerCard. */
export function LedgerNote({ children }: { children: ReactNode }) {
  return (
    <p className="border-t border-border px-4 py-[11px] text-sm text-foreground-secondary">
      {children}
    </p>
  )
}

/** Small square icon button used in ledger card headers. */
export function LedgerIconButton({
  icon,
  label,
  onClick,
}: {
  icon: LedgerIconName
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-background text-foreground transition-colors hover:bg-fill"
    >
      <LedgerIcon name={icon} className="h-3.5 w-3.5 shrink-0" />
    </button>
  )
}

export function LedgerStatusPill({ open, label }: { open: boolean; label: string }) {
  return (
    <span
      className={
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium " +
        (open
          ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-400"
          : "border-border text-foreground-tertiary")
      }
    >
      {label}
    </span>
  )
}

/** Panel with an uppercase eyebrow label, used for highlights and the countdown. */
export function LedgerPanel({
  label,
  labelExtra,
  aside,
  children,
  onMouseEnter,
  onMouseLeave,
}: {
  label: string
  labelExtra?: ReactNode
  aside?: ReactNode
  children: ReactNode
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}) {
  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="flex flex-col gap-3 rounded-xl border border-border bg-fill-secondary/60 p-4 dark:bg-fill-secondary/90"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            {label}
          </span>
          {labelExtra}
        </div>
        {aside}
      </div>
      {children}
    </div>
  )
}

export function LedgerStatTile({
  value,
  label,
  sub,
  valueClassName = "text-foreground",
  fit = false,
}: {
  value: ReactNode
  label: string
  sub?: string
  valueClassName?: string
  /** Shrink the value to fit the tile's width (for text like event names). */
  fit?: boolean
}) {
  return (
    <div className="@container flex min-w-0 flex-col justify-center rounded-lg bg-background/90 px-2 py-2.5 text-center shadow-sm ring-1 ring-inset ring-black/5 dark:bg-fill-secondary dark:shadow-none dark:ring-white/10">
      <span
        className={`block whitespace-nowrap font-semibold tabular-nums tracking-[-0.01em] ${
          fit ? "flex min-h-7 items-center justify-center text-[length:min(20px,21cqi)] leading-[1.2]" : "text-xl"
        } ${valueClassName}`}
      >
        {value}
      </span>
      <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.025em] text-foreground-tertiary">
        {label}
      </span>
      {sub ? (
        <span className="mt-0.5 block truncate text-xs text-foreground-secondary">{sub}</span>
      ) : null}
    </div>
  )
}
