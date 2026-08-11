import { formatRoomLabel, roomAthleteSlotCount } from "@/lib/meet-rooms"

type RoomAthlete = {
  id: string
  firstName: string
  lastName: string
}

export default function MeetRoomAssignmentsList({
  rooms,
  selfAthleteId,
}: {
  rooms: Array<{
    athletes: RoomAthlete[]
  }>
  selfAthleteId: string | null
}) {
  if (rooms.length === 0) return null

  const athleteSlots = roomAthleteSlotCount(rooms)

  return (
    <div className="mt-4 space-y-3">
      <h3 className="text-sm font-medium">Room assignments</h3>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-fill-secondary/50 text-left text-xs uppercase tracking-wide text-foreground-secondary">
              <th className="px-2 py-2 font-medium w-12 text-center">Room</th>
              {Array.from({ length: athleteSlots }, (_, i) => (
                <th key={i} className="px-3 py-2 font-medium">
                  Athlete {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rooms.map((room, index) => {
              const isMine =
                !!selfAthleteId && room.athletes.some((a) => a.id === selfAthleteId)
              return (
                <tr key={index} className={isMine ? "bg-primary/5" : undefined}>
                  <td className="px-2 py-2 whitespace-nowrap font-medium text-center">
                    {formatRoomLabel(index + 1)}
                    {isMine ? (
                      <span className="ml-1 text-xs font-normal text-foreground-secondary">
                        (You)
                      </span>
                    ) : null}
                  </td>
                  {Array.from({ length: athleteSlots }, (_, slot) => {
                    const athlete = room.athletes[slot]
                    const isSelf = athlete && athlete.id === selfAthleteId
                    return (
                      <td
                        key={slot}
                        className={
                          "px-3 py-2 text-foreground-secondary whitespace-nowrap " +
                          (isSelf ? "font-medium text-foreground" : "")
                        }
                      >
                        {athlete ? `${athlete.lastName}, ${athlete.firstName}` : "—"}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
