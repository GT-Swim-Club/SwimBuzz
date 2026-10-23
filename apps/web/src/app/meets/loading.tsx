import { SavedListLayout } from "@/components/ui/ListLayout"
import MeetsListSkeleton, { MeetsToolbarSkeleton } from "./MeetsListSkeleton"

export default function Loading() {
  return (
    <main className="flex flex-col gap-6" aria-busy="true" aria-label="Loading meets">
      <MeetsToolbarSkeleton />
      <SavedListLayout
        page="meets"
        list={<MeetsListSkeleton layout="list" />}
        gallery={<MeetsListSkeleton layout="gallery" />}
      />
    </main>
  )
}
