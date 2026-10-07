import { NextResponse } from "next/server"
import { suggestRoomGroups } from "@/lib/meet/meet-rooms"
import { formatAthleteName, loadMeetRoomContext, toGender } from "../_shared"
import { getSession } from "@/lib/auth/session"
import { isStaffRole } from "@swimbuzz/shared"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id: meetId } = await params
  const ctx = await loadMeetRoomContext(meetId)
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!ctx.meet.roomForm) {
    return NextResponse.json({ error: "Roommate form not set up" }, { status: 404 })
  }

  const roster = ctx.roster.map((a) => ({
    id: a.id,
    name: formatAthleteName(a),
    gender: toGender(a.gender)}))

  const preferences = ctx.meet.roomForm.preferences.map((p) => ({
    athleteId: p.athleteId,
    preferredAthleteIds: p.preferredAthleteIds,
    excludedAthleteIds: p.excludedAthleteIds}))

  const result = suggestRoomGroups(preferences, roster)

  return NextResponse.json({
    rooms: result.rooms,
    unassigned: result.unassigned.map((id) => {
      const a = ctx.roster.find((r) => r.id === id)
      return a
        ? {
            id: a.id,
            firstName: a.firstName,
            lastName: a.lastName,
            gender: toGender(a.gender)}
        : { id, firstName: "", lastName: "", gender: "M" as const }
    })})
}
