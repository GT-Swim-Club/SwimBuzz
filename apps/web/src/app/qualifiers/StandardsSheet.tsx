import type { StandardsTableRow } from "@/lib/qualifiers/nationals-qualifiers"
import { ledgerHeaderClass } from "@/components/meet/Ledger"

/** Women's cut · Event · Men's cut, mirrored like the Records sheet; one gender shows Event · Cut. */
const BOTH_COLS = "grid-cols-[minmax(0,1fr)_minmax(7.5rem,15rem)_minmax(0,1fr)]"
const ONE_COLS = "grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"

const columnLabelClass = "px-2 py-1.5 text-center text-[11px] font-semibold tracking-[0.11em] text-foreground-tertiary"
const cellClass = "flex min-w-0 items-center justify-center px-2 py-2 text-[15px]"

/** A standards cell: the time, or a dash where the PDF has none ("--"). */
function CutCell({ value }: { value: string }) {
  const empty = !value || value === "--"
  return (
    <div className={cellClass}>
      {empty ? (
        <span className="text-foreground-tertiary">—</span>
      ) : (
        <span className="font-mono font-medium tabular-nums text-foreground">{value}</span>
      )}
    </div>
  )
}

/**
 * The season's Nationals standards inline, laid out like the Records sheet,
 * so the cuts are readable before anyone has made one. `gender` narrows it
 * to one column, like the rest of the page.
 */
export default function StandardsSheet({
  rows,
  gender,
  title,
}: {
  rows: StandardsTableRow[]
  gender: "all" | "F" | "M"
  title: string
}) {
  const both = gender === "all"
  const cols = both ? BOTH_COLS : ONE_COLS
  const side = gender === "M" ? "men" : "women"
  // One gender drops the events that gender has no cut in.
  const shown = both ? rows : rows.filter((row) => row[side] && row[side] !== "--")
  if (shown.length === 0) return null

  return (
    <section
      aria-label={title}
      className="overflow-hidden rounded-xl border border-border bg-background shadow-sm"
    >
      <div className="border-b border-border bg-fill-secondary/60 px-3 py-3 text-center">
        <h2 className={ledgerHeaderClass}>{title}</h2>
      </div>
      <div className={`grid ${cols} border-b border-fill`}>
        {both ? (
          <>
            <span className={columnLabelClass}>WOMEN</span>
            <span className={`${columnLabelClass} border-x border-border`}>EVENT</span>
            <span className={columnLabelClass}>MEN</span>
          </>
        ) : (
          <>
            <span className={`${columnLabelClass} border-r border-border`}>EVENT</span>
            <span className={columnLabelClass}>{gender === "F" ? "WOMEN" : "MEN"}</span>
          </>
        )}
      </div>
      {shown.map((row, index) => (
        <div key={`${row.event}|${index}`} className={`grid ${cols} ${index === 0 ? "" : "border-t border-border"}`}>
          {both ? (
            <>
              <CutCell value={row.women} />
              <div className={`${cellClass} border-x border-border text-center font-medium text-foreground`}>
                {row.event}
              </div>
              <CutCell value={row.men} />
            </>
          ) : (
            <>
              <div className={`${cellClass} border-r border-border text-center font-medium text-foreground`}>
                {row.event}
              </div>
              <CutCell value={row[side]} />
            </>
          )}
        </div>
      ))}
    </section>
  )
}
