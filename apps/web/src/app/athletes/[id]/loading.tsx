import { Skeleton } from "@/components/ui/Skeleton"

const strokeAccents = [
  "border-l-sky-400 dark:border-l-sky-500",
  "border-l-violet-400 dark:border-l-violet-500",
  "border-l-amber-400 dark:border-l-amber-500",
  "border-l-rose-400 dark:border-l-rose-500",
]

const pbGroups = [
  { label: "w-10", cards: 6 },
  { label: "w-10", cards: 4 },
]

export default function Loading() {
  return (
    <main className="mx-auto max-w-4xl space-y-8" aria-busy="true" aria-label="Loading athlete">
      <div>
        <Skeleton className="h-4 w-16" />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <Skeleton className="h-20 w-20 shrink-0 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-8 w-56" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </div>

      <section className="space-y-4">
        <Skeleton className="h-4 w-32" />
        {pbGroups.map((group, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className={`h-4 ${group.label}`} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[...Array(group.cards)].map((_, j) => (
                <div
                  key={j}
                  className={`rounded-xl border border-border-secondary bg-background border-l-[3px] px-3 py-3 shadow-sm sm:px-4 sm:py-4 ${strokeAccents[j % strokeAccents.length]}`}
                >
                  <Skeleton className="h-3.5 w-4/5" />
                  <Skeleton className="mt-2 h-5 w-1/2" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-28" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20 rounded-lg" />
            <Skeleton className="h-8 w-20 rounded-lg" />
          </div>
        </div>
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border-secondary">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3 bg-background px-4 py-3">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
