import Link from "next/link"
import type { ReactNode } from "react"
import { AppIcon } from "@/components/ui/AppIcon"
import MeetListMeta, { MeetListName, MeetListThumb } from "./MeetListMeta"

export type MeetListRow = {
  id: string
  name: string
  /** Omitted for rows that can't be opened (e.g. meets in Trash). */
  href?: string
  iconUrl: string | null
  bannerUrl: string | null
  date: ReactNode
  location: string
  /** Short status ending the meta line under the name ("in 6 days", "12 days left"). */
  status?: ReactNode
  actions?: ReactNode
}

/**
 * Column tracks per actions width: none, a lone edit icon, or Trash's
 * Restore + delete pair. Location joins at lg and Date at md; below those they
 * move into the meta line under the name. Header and rows share these tracks.
 */
export const MEET_LIST_COLS = {
  none: "grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_170px] lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1.22fr)_170px]",
  edit: "grid-cols-[minmax(0,1fr)_16px] md:grid-cols-[minmax(0,1fr)_170px_16px] lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1.22fr)_170px_16px]",
  trash:
    "grid-cols-[minmax(0,1fr)_72px] sm:grid-cols-[minmax(0,1fr)_136px] md:grid-cols-[minmax(0,1fr)_170px_136px] lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1.22fr)_170px_136px]",
}

const cellIconClass = "h-3.5 w-3.5 shrink-0 text-foreground-tertiary"

function Row({ row, cols }: { row: MeetListRow; cols: string }) {
  const hasLocation = !!row.location

  return (
    <div
      className={`relative grid items-center gap-6 border-t border-border-secondary px-5 py-[18px] transition-colors first:border-t-0 has-[a[data-row-link]:focus-visible]:bg-fill-quaternary dark:has-[a[data-row-link]:focus-visible]:bg-fill ${
        row.href ? "hover:bg-background-hover" : ""
      } ${cols}`}
    >
      {row.href && <Link href={row.href} data-row-link aria-label={row.name} className="absolute inset-0 outline-none" />}

      <div className="flex min-w-0 items-center gap-3">
        <MeetListThumb iconUrl={row.iconUrl} bannerUrl={row.bannerUrl} />
        {/* flex-1 so the meta line measures the full width it has to fit into. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <MeetListName>{row.name}</MeetListName>
          <MeetListMeta date={row.date} location={row.location} status={row.status} />
        </div>
      </div>

      <span className="hidden min-w-0 items-center gap-1.5 text-foreground-secondary lg:flex">
        {hasLocation && (
          <>
            <AppIcon name="mapPin" className={cellIconClass} />
            <span className="min-w-0 truncate">{row.location}</span>
          </>
        )}
      </span>

      <div className="hidden items-center gap-1.5 md:flex">
        <AppIcon name="calendar" className={cellIconClass} />
        <span className="whitespace-nowrap tabular-nums text-foreground-secondary">{row.date}</span>
      </div>

      {row.actions && <div className="relative flex items-center justify-end gap-2">{row.actions}</div>}
    </div>
  )
}

/** Meets as table rows: icon, name, location, date, and row actions — the List counterpart to MeetCardRows. */
export default function MeetListTable({
  rows,
  actions = "none",
}: {
  rows: MeetListRow[]
  /** Width of the trailing actions column, shared by every row. */
  actions?: keyof typeof MEET_LIST_COLS
}) {
  const cols = MEET_LIST_COLS[actions]
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background">
      <div
        className={`grid items-center gap-6 border-b border-border-secondary px-5 pb-2.5 pt-3 text-[11px] font-semibold uppercase leading-[14px] tracking-[0.14em] text-foreground-tertiary ${cols}`}
      >
        <span>Meet</span>
        <span className="hidden lg:block">Location</span>
        <span className="hidden md:block">Date</span>
        {actions !== "none" && <span />}
      </div>
      {rows.map((row) => (
        <Row key={row.id} row={row} cols={cols} />
      ))}
    </div>
  )
}
