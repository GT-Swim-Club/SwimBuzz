import { Skeleton } from "@/components/ui/Skeleton"

const configRows = ["w-40", "w-56", "w-48", "w-40"]

export default function Loading() {
  return (
    <main
      className="mx-auto w-full max-w-[44rem] flex flex-col gap-6 py-2 sm:py-4"
      aria-busy="true"
      aria-label="Loading relay builder"
    >
      <Skeleton className="h-4 w-20" />
      <header className="space-y-2">
        <Skeleton className="h-9 w-2/3 max-w-md sm:h-10" />
        <Skeleton className="h-3 w-28" />
      </header>
      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background">
        {configRows.map((width, i) => (
          <div key={i} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-6">
            <Skeleton className="h-4 w-20 shrink-0 sm:w-28" />
            <Skeleton className={`h-9 ${width}`} />
          </div>
        ))}
      </div>
      <Skeleton className="h-10 w-32 rounded-lg" />
    </main>
  )
}
