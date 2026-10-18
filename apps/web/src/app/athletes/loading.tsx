import { readListLayout } from "@/lib/list-layout-server"
import RosterSkeleton from "./RosterSkeleton"

export default async function Loading() {
  const layout = await readListLayout("roster")
  return (
    <main className="flex flex-col gap-6" aria-busy="true" aria-label="Loading roster">
      <RosterSkeleton layout={layout} />
    </main>
  )
}
