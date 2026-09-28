import { Skeleton } from "@/components/ui/Skeleton"

const competitionRows = ["w-28", "w-32", "w-24", "w-24"]
const summaryRows = ["w-40", "w-36", "w-32", "w-40", "w-36", "w-44", "w-32"]

function LedgerCardSkeleton({ titleWidth, rows }: { titleWidth: string; rows: string[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background">
      <div className="flex min-h-[3.25rem] items-center justify-between gap-2 px-4 py-3">
        <Skeleton className={`h-4 ${titleWidth}`} />
        <Skeleton className="h-7 w-7 rounded-lg" />
      </div>
      {rows.map((width, i) => (
        <div key={i} className="flex items-center justify-between gap-3 border-t border-border px-4 py-[11px]">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-4 w-4" />
            <Skeleton className={`h-4 ${width}`} />
          </div>
          <Skeleton className="h-3 w-2" />
        </div>
      ))}
    </div>
  )
}

/** Mirrors the ledger + roster summary layout (the common case for meets with sheets/results). */
export default function Loading() {
  return (
    <main className="relative mx-auto max-w-[1240px]" aria-busy="true" aria-label="Loading meet">
      <div className="relative z-10 flex flex-col gap-8">
        <div className="min-w-0">
          <Skeleton className="h-4 w-16" />
          <div className="mt-2 flex items-center justify-between gap-3">
            <Skeleton className="h-9 w-3/5 max-w-md sm:h-10" />
            <div className="flex shrink-0 gap-2">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="h-9 w-9 rounded-lg" />
            </div>
          </div>
          <Skeleton className="mt-3 h-5 w-52" />
          <Skeleton className="mt-2 h-5 w-72 max-w-full" />
        </div>

        <div className="flex flex-wrap items-start">
          <aside className="flex max-w-full flex-[0_0_420px] flex-col gap-4 max-[900px]:!flex-[1_1_100%]">
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-fill-secondary/60 p-4 dark:bg-fill-secondary/90">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-4 w-12" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="flex flex-col items-center gap-2 rounded-lg px-2 py-3 ring-1 ring-inset ring-black/5 dark:ring-white/10"
                  >
                    <Skeleton className="h-6 w-10" />
                    <Skeleton className="h-2.5 w-14" />
                  </div>
                ))}
              </div>
            </div>
            <LedgerCardSkeleton titleWidth="w-24" rows={competitionRows} />
            <LedgerCardSkeleton titleWidth="w-14" rows={["w-28"]} />
          </aside>

          <div className="flex w-6 shrink-0 items-stretch justify-center self-stretch max-[900px]:hidden">
            <span className="w-px bg-border" />
          </div>

          <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-3 pl-2 max-[900px]:mt-8 max-[900px]:pl-0">
            <div className="flex items-center gap-2 pb-1">
              <Skeleton className="h-[38px] min-w-0 flex-1 rounded-lg" />
              <Skeleton className="h-[38px] w-[38px] shrink-0 rounded-lg" />
              <Skeleton className="h-[38px] w-[38px] shrink-0 rounded-lg" />
            </div>
            <div className="overflow-hidden rounded-xl border border-border bg-background">
              <div className="px-4 py-3">
                <Skeleton className="h-4 w-16" />
              </div>
              {summaryRows.map((width, i) => (
                <div key={i} className="flex items-center gap-3 border-t border-border px-4 py-3">
                  <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className={`h-4 ${width} max-w-full`} />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="hidden h-5 w-12 rounded-full sm:block" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-9 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
