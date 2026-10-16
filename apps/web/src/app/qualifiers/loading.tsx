import { readListLayout } from "@/lib/list-layout-server"
import QualifiersSkeleton from "./QualifiersSkeleton"

export default async function Loading() {
  const layout = await readListLayout("nationals")
  return (
    <main className="flex flex-col gap-4" aria-busy="true" aria-label="Loading qualifiers">
      <QualifiersSkeleton layout={layout} />
    </main>
  )
}
