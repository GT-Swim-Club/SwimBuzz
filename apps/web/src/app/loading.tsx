import { Skeleton } from "@/components/Skeleton"

export default function Loading() {
  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden border-b border-border-secondary py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 space-y-4 xl:max-w-none xl:px-[clamp(8rem,10vw,18rem)]">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-12 w-3/4 max-w-2xl" />
          <Skeleton className="h-6 w-full max-w-xl" />
          <div className="flex gap-4 pt-6">
            <Skeleton className="h-12 w-32 rounded-xl" />
            <Skeleton className="h-12 w-32 rounded-xl" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:py-20 space-y-10 xl:max-w-none xl:px-[clamp(8rem,10vw,18rem)]">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-10 lg:grid-cols-2">
          {[...Array(2)].map((_, col) => (
            <div key={col} className="space-y-4">
              <Skeleton className="h-6 w-32" />
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-3.5 w-4/5" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
