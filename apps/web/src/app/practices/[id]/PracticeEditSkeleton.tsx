import { Skeleton } from "@/components/Skeleton"

export default function PracticeEditSkeleton() {
  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <Skeleton className="h-9 w-64" />
      <div className="space-y-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </main>
  )
}
