"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { athleteStatusIcons, type AthleteClearanceSummary } from "@swimbuzz/shared"
import StatusIcon from "@/components/athlete/StatusIcon"
import EditClearanceModal from "@/components/athlete/EditClearanceModal"
import ImportTimesButton from "./ImportTimesButton"

/**
 * Status icons beside the athlete's name — physical, concussion test, SwimCloud times — green /
 * yellow / red, for staff and the athlete themself. Staff (`editable`) click a clearance icon to
 * correct it and the stopwatch to import times; the athlete just sees them.
 */
export default function AthleteHeaderIcons({
  editable,
  athlete,
  clearance,
  swimCloudIds,
  timesSyncedAt,
}: {
  editable: boolean
  athlete: { id: string; firstName: string; lastName: string; preferredName: string | null }
  clearance: AthleteClearanceSummary
  swimCloudIds: number[]
  timesSyncedAt: string | null
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const items = athleteStatusIcons({ clearance, swimCloudIds, timesSyncedAt })

  if (!editable) {
    return (
      <span className="inline-flex items-center -space-x-1">
        {items.map((item) => (
          <StatusIcon key={item.key} item={item} size="lg" />
        ))}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center -space-x-1">
      {items.map((item) => {
        if (item.key !== "swimcloud") {
          return (
            <StatusIcon
              key={item.key}
              item={item}
              size="lg"
              onClick={() => setEditing(true)}
              actionLabel="Edit clearance"
            />
          )
        }
        return (
          <ImportTimesButton
            key={item.key}
            athleteId={athlete.id}
            swimCloudIds={swimCloudIds}
            timesSyncedAt={timesSyncedAt}
            trigger={(open) => <StatusIcon item={item} size="lg" onClick={open} actionLabel="Import times" />}
          />
        )
      })}
      <EditClearanceModal
        athlete={
          editing
            ? {
                athleteId: athlete.id,
                firstName: athlete.firstName,
                lastName: athlete.lastName,
                preferredName: athlete.preferredName,
                physical: clearance.physical,
                concussion: clearance.concussion,
              }
            : null
        }
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false)
          router.refresh()
        }}
      />
    </span>
  )
}
