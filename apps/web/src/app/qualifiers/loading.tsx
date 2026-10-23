import { SavedListLayout } from "@/components/ui/ListLayout"
import QualifiersSkeleton from "./QualifiersSkeleton"

export default function Loading() {
  return (
    <main className="flex flex-col gap-4" aria-busy="true" aria-label="Loading qualifiers">
      <SavedListLayout
        page="nationals"
        list={<QualifiersSkeleton layout="list" />}
        gallery={<QualifiersSkeleton layout="gallery" />}
      />
    </main>
  )
}
