import MeetsListSkeleton, { MeetsToolbarSkeleton } from "./MeetsListSkeleton"

export default function Loading() {
  return (
    <main className="flex flex-col gap-6" aria-busy="true" aria-label="Loading meets">
      <MeetsToolbarSkeleton />
      <MeetsListSkeleton />
    </main>
  )
}
