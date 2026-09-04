import { Skeleton } from "@/components/ui/Skeleton"

const setSkeletons = [
  { title: "w-24", distance: "w-10", lines: ["w-full", "w-5/6", "w-2/3"] },
  { title: "w-32", distance: "w-12", lines: ["w-11/12", "w-3/4"] },
  { title: "w-20", distance: "w-10", lines: ["w-full", "w-4/5", "w-1/2"] },
  { title: "w-28", distance: "w-12", lines: ["w-10/12", "w-2/3"] },
]

export default function PracticeViewSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading practice">
      <header>
        <Skeleton className="h-4 w-24" />
        <div className="mt-2 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <Skeleton className="h-10 w-3/5 max-w-xl" />
            <Skeleton className="h-5 w-52" />
            <Skeleton className="h-4 w-72" />
          </div>
          <div className="flex shrink-0 gap-2">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-9 w-9 rounded-lg" />
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-border bg-background px-4 py-3">
        <div className="space-y-2">
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-3/4" />
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-background px-5 py-4 shadow-sm sm:px-6 sm:py-5">
        <div className="space-y-5">
          {setSkeletons.map((set, index) => (
            <div
              key={index}
              className="space-y-3 border-b border-border pb-5 last:border-b-0 last:pb-0"
            >
              <div className="flex items-center justify-between gap-3">
                <Skeleton className={`h-5 ${set.title}`} />
                <Skeleton className={`h-4 ${set.distance}`} />
              </div>
              <div className="space-y-2">
                {set.lines.map((width, lineIndex) => (
                  <Skeleton key={lineIndex} className={`h-4 ${width}`} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-background p-4 shadow-sm sm:p-5">
        <Skeleton className="h-5 w-28" />
        <div className="mt-4 space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </section>
    </div>
  )
}
