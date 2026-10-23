import { SavedListLayout } from "@/components/ui/ListLayout"
import RosterSkeleton from "./RosterSkeleton"

export default function Loading() {
  return (
    <main className="flex flex-col gap-6" aria-busy="true" aria-label="Loading roster">
      <SavedListLayout
        page="roster"
        list={<RosterSkeleton layout="list" />}
        gallery={<RosterSkeleton layout="gallery" />}
      />
    </main>
  )
}
