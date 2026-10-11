import { readListLayout } from "@/lib/list-layout-server"
import MeetsListSkeleton, { MeetsToolbarSkeleton } from "./MeetsListSkeleton"

export default async function Loading() {
  const layout = await readListLayout("meets")
  return (
    <main className="flex flex-col gap-6" aria-busy="true" aria-label="Loading meets">
      <MeetsToolbarSkeleton />
      <MeetsListSkeleton layout={layout} />
    </main>
  )
}
