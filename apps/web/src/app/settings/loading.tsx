import { Skeleton } from "@/components/Skeleton"

export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-1">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-5 w-64" />
      </div>

      {[...Array(4)].map((_, i) => (
        <section key={i} className="rounded-xl border border-border-secondary h-48">
          <div className="border-b border-border-secondary px-4 py-3">
            <Skeleton className="h-5 w-32" />
          </div>
          <div className="space-y-4 px-4 py-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        </section>
      ))}
    </div>
  )
}
