import { NextResponse } from "next/server"
import { isStaffRole } from "@swimbuzz/shared"
import { getSession } from "@/lib/auth/session"
import { AthleteSeasonError, removeAthleteSeasons } from "@/lib/athlete/athlete-seasons"

/** Take an athlete off seasons' rosters: body `{ remove: string[] }` → `{ seasons }` left. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json().catch(() => null)
  try {
    const seasons = await removeAthleteSeasons(id, body?.remove)
    return NextResponse.json({ seasons })
  } catch (err) {
    if (err instanceof AthleteSeasonError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    throw err
  }
}
