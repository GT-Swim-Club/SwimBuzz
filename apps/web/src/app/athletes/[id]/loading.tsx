import { Skeleton } from "@/components/ui/Skeleton"

const strokeGroups = [5, 3, 3, 3, 2]
const meetGroups = [5, 3]

export default function Loading() {
  return (
    <main className="flex flex-col gap-6" aria-busy="true" aria-label="Loading athlete">
      <div>
        <Skeleton className="h-5 w-16" />
        <div className="mt-1 flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-[1_1_360px] items-center gap-5">
            <Skeleton className="h-20 w-20 shrink-0 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-9 w-56" />
              <Skeleton className="h-5 w-64" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-9 w-9 rounded-lg" />
            <Skeleton className="h-9 w-9 rounded-lg" />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-start">
        <div className="flex w-[340px] shrink-0 flex-col max-[900px]:w-full">
          <div className="mb-1.5 flex min-h-[34px] items-center">
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="rounded-xl border border-border-secondary bg-background pb-2.5 pt-3.5 shadow-xs">
            <div className="px-3 pb-2">
              <Skeleton className="h-9 w-full rounded-lg" />
            </div>
            {strokeGroups.map((rows, gi) => (
              <div key={gi} className="pt-[3px]">
                {gi > 0 && <span aria-hidden className="mx-3 mb-[3px] block h-px bg-border-secondary" />}
                {[...Array(rows)].map((_, i) => (
                  <div key={i} className="mx-1.5 flex items-center justify-between gap-3 px-3 py-2.5">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-14" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div aria-hidden className="flex w-6 shrink-0 justify-center self-stretch max-[900px]:hidden">
          <span className="w-px bg-border" />
        </div>

        <div className="flex min-w-0 flex-[1_1_480px] flex-col gap-1.5 pl-2 max-[900px]:mt-8 max-[900px]:pl-0">
          <div className="flex min-h-[34px] items-center justify-between gap-3">
            <Skeleton className="h-4 w-20" />
            <div className="flex gap-3">
              <Skeleton className="h-[34px] w-[34px] rounded-lg" />
              <Skeleton className="h-[34px] w-[34px] rounded-lg" />
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-border-secondary bg-background">
            {meetGroups.map((rows, gi) => (
              <div key={gi} className={gi > 0 ? "border-t border-border-secondary" : ""}>
                <div className="space-y-1.5 px-4 pb-2.5 pt-3.5">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-3 w-28" />
                </div>
                {[...Array(rows)].map((_, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 border-t border-border-secondary px-4 py-3.5">
                    <Skeleton className="h-4 w-32" />
                    <div className="flex gap-6">
                      <Skeleton className="h-4 w-14" />
                      <Skeleton className="h-4 w-10 max-[600px]:hidden" />
                      <Skeleton className="h-4 w-24 max-[600px]:hidden" />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
