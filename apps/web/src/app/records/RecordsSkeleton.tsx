import { Skeleton } from "@/components/ui/Skeleton"

const COLS = "grid-cols-[4.5rem_minmax(0,1fr)_6rem_minmax(13rem,15rem)_6rem_minmax(0,1fr)_4.5rem]"
/** Per-row widths, varied so the rows don't look stamped. */
const NAME_WIDTHS = ["w-32", "w-28", "w-36", "w-24", "w-32", "w-28", "w-20", "w-36", "w-28", "w-24"]
/** Rows per stroke group, then a relay (four names). */
const GROUPS = [4, 3, 3]

function SideSkeleton({ row, mirrored, relay }: { row: number; mirrored: boolean; relay: boolean }) {
  const names = (
    <div key="names" className="flex flex-col items-center gap-1.5 px-2 py-2.5">
      {Array.from({ length: relay ? 4 : 1 }, (_, i) => (
        <Skeleton key={i} className={`h-4 ${NAME_WIDTHS[(row * 3 + i + (mirrored ? 5 : 0)) % NAME_WIDTHS.length]}`} />
      ))}
    </div>
  )
  const cells = [
    <div key="year" className="flex items-center justify-center py-2.5">
      <Skeleton className="h-4 w-10" />
    </div>,
    names,
    <div key="time" className="flex items-center justify-center py-2.5">
      <Skeleton className="h-4 w-14" />
    </div>,
  ]
  return <>{mirrored ? cells.reverse() : cells}</>
}

function TableSkeleton({ canEdit }: { canEdit: boolean }) {
  let row = 0
  return (
    <div className="hidden overflow-hidden rounded-xl border border-border-secondary bg-background lg:block">
      <div className={`grid ${COLS} border-b border-border-secondary`}>
        <div className="col-span-3 flex justify-center py-3.5">
          <Skeleton className="h-3 w-32" />
        </div>
        <div className="flex justify-center border-x border-border-secondary py-3.5">
          <Skeleton className="h-3 w-40" />
        </div>
        <div className="relative col-span-3 flex justify-center py-3.5">
          <Skeleton className="h-3 w-28" />
          {canEdit ? <Skeleton className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 rounded-md" /> : null}
        </div>
      </div>
      <div className={`grid ${COLS} border-b border-border-secondary`}>
        {["w-8", "w-10", "w-8", "w-10", "w-8", "w-10", "w-8"].map((w, i) => (
          <div key={i} className={`flex justify-center py-2 ${i === 3 ? "border-x border-border-secondary" : ""}`}>
            <Skeleton className={`h-2.5 ${w}`} />
          </div>
        ))}
      </div>
      {[...GROUPS.map((count) => Array.from({ length: count }, () => false)), [true]].map((group, g) =>
        group.map((relay, i) => {
          const index = row++
          return (
            <div key={`${g}-${i}`} className={`grid ${COLS} ${index > 0 ? "border-t border-border-secondary" : ""}`}>
              <SideSkeleton row={index} mirrored={false} relay={relay} />
              <div className="flex items-center justify-center border-x border-border-secondary py-2.5">
                <Skeleton className={`h-4 ${NAME_WIDTHS[(index + 2) % NAME_WIDTHS.length]}`} />
              </div>
              <SideSkeleton row={index} mirrored relay={relay} />
            </div>
          )
        })
      )}
    </div>
  )
}

function ListSkeleton({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="flex flex-col gap-4 lg:hidden">
      <div className="flex items-center gap-2">
        <div className="flex h-[42px] min-w-0 flex-1 items-center gap-1 rounded-lg border border-border-secondary bg-background p-1 sm:max-w-xs">
          <Skeleton className="h-full flex-1 rounded-md" />
          <div className="flex flex-1 justify-center">
            <Skeleton className="h-3.5 w-10" />
          </div>
        </div>
        {canEdit ? <Skeleton className="ml-auto h-8 w-8 rounded-md" /> : null}
      </div>
      {GROUPS.map((count, g) => (
        <div key={g} className="overflow-hidden rounded-xl border border-border-secondary bg-background">
          <div className="border-b border-border-secondary px-4 py-3">
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="divide-y divide-border-secondary">
            {Array.from({ length: count }, (_, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 px-4 py-3">
                <Skeleton className={`h-4 ${NAME_WIDTHS[(g * 3 + i) % NAME_WIDTHS.length]}`} />
                <Skeleton className="h-4 w-14 justify-self-end" />
                <Skeleton className={`h-3.5 ${NAME_WIDTHS[(g * 3 + i + 4) % NAME_WIDTHS.length]}`} />
                <Skeleton className="h-3.5 w-10 justify-self-end" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Mirrors the records page: the sheet table (lg+) or the per-gender list, with staff's edit button. */
export default function RecordsSkeleton({ canEdit = false }: { canEdit?: boolean }) {
  return (
    <>
      <TableSkeleton canEdit={canEdit} />
      <ListSkeleton canEdit={canEdit} />
    </>
  )
}
