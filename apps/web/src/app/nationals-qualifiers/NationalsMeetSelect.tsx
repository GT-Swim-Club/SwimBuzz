"use client"

import { useOptimistic, useTransition } from "react"
import { useRouter } from "next/navigation"
import ToolbarSelect from "@/components/ui/ToolbarSelect"
import { useImportTask } from "@/components/ui/ImportTaskProvider"

/**
 * Staff only: which of the season's meets is its Nationals. That meet's order of events numbers
 * the page's events (women's and men's numbers), on the page, its PDF and mobile.
 */
export default function NationalsMeetSelect({
  season,
  meets,
  currentMeetId,
}: {
  season: string
  meets: { id: string; name: string }[]
  currentMeetId: string | null
}) {
  const router = useRouter()
  const { startTask } = useImportTask()
  const [, startTransition] = useTransition()
  const [shownMeetId, setShownMeetId] = useOptimistic(currentMeetId ?? "")
  const current = meets.find((meet) => meet.id === shownMeetId)

  function change(meetId: string) {
    startTransition(async () => {
      setShownMeetId(meetId)
      const save = (async () => {
        const res = await fetch("/api/qualifiers/nationals-meet", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ season, meetId: meetId || null }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Couldn't link the meet")
        router.refresh()
        return meetId ? "Event numbers now come from this meet" : "Nationals meet unlinked"
      })()
      // The toast reports the outcome; on failure the optimistic choice falls back once this settles.
      startTask(meetId ? "Linking Nationals meet..." : "Unlinking Nationals meet...", save)
      await save.catch(() => {})
    })
  }

  return (
    <ToolbarSelect
      label="Nationals meet"
      icon="trophy"
      current={current ? `Nationals meet: ${current.name}` : "No Nationals meet"}
      active={!!current}
      value={shownMeetId}
      onChange={change}
    >
      <option value="">No Nationals meet</option>
      {meets.map((meet) => (
        <option key={meet.id} value={meet.id}>
          {meet.name}
        </option>
      ))}
    </ToolbarSelect>
  )
}
