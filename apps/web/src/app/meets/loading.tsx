import { Skeleton } from "@/components/Skeleton"

export default function Loading() {
  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-24" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>
      
      <Skeleton className="h-10 w-full" />
      
      <div className="space-y-8">
        {[...Array(2)].map((_, i) => (
          <section key={i} className="space-y-4">
            <Skeleton className="h-6 w-32" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(3)].map((_, j) => (
                <Skeleton key={j} className="h-48 w-full" />
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  )
}
