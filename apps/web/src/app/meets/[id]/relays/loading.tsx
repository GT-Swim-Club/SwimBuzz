import { Skeleton } from "@/components/Skeleton"

export default function Loading() {
  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-64" />
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </main>
  )
}
