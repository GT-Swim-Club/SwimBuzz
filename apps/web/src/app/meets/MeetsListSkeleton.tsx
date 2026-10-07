import { Skeleton } from "@/components/ui/Skeleton"

export default function MeetsListSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="aspect-video w-full rounded-2xl sm:aspect-[32/9]" />
      </section>
      <section className="flex flex-col gap-3">
        <Skeleton className="h-5 w-28" />
        <div className="grid aspect-[32/9] grid-cols-3 gap-4 max-sm:aspect-auto max-sm:grid-cols-1">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-full w-full rounded-2xl max-sm:aspect-video" />
          ))}
        </div>
      </section>
    </div>
  )
}
