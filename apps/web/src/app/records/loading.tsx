import RecordsSkeleton from "./RecordsSkeleton"

export default function Loading() {
  return (
    <main className="flex flex-col gap-4" aria-busy="true" aria-label="Loading records">
      <RecordsSkeleton />
    </main>
  )
}
