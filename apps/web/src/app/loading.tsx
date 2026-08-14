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
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </section>
    </div>
  )
}
