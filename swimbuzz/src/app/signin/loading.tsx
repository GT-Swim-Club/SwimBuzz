import { Skeleton } from "@/components/Skeleton"

export default function Loading() {
  return (
    <div className="relative -mx-4 -my-8 flex min-h-[calc(100vh-65px)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-border-secondary bg-background/90 p-8 shadow-xl">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-8 h-8 w-48" />
        <Skeleton className="mt-2 h-4 w-64" />
        
        <div className="mt-8 space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  )
}
