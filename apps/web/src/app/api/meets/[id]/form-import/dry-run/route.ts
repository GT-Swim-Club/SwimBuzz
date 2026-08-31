import { NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { isStaffRole } from "@/lib/auth-roles"
import { isColumnMappingValid } from "@/lib/form-import-columns"
import { loadFormImportRoster, matchImportRow } from "@/lib/form-import-match"
import { normalizeMeetSignupQuestions, resolveSignupEventOptions } from "@/lib/meet-signup"
import { parseSignupResponseRecords, runSignupResponseImport } from "@/lib/meet-signup-import"
import { parseRoomResponseRecords, runRoomResponseImport } from "@/lib/meet-room-import"
import {
  loadFormImportMeetContext,
  parseFormType,
  parseMapping,
  readMappedSheet,
  SheetReadError,
} from "../_shared"

export const runtime = "nodejs"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session || !isStaffRole(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id: meetId } = await params
  const body = await req.json().catch(() => ({}))
  const formType = parseFormType(body.formType)
  const accessToken = typeof body.accessToken === "string" ? body.accessToken : ""
  const spreadsheetId = typeof body.spreadsheetId === "string" ? body.spreadsheetId : ""
  const gid = typeof body.gid === "number" ? body.gid : undefined
  const mapping = parseMapping(body.mapping)

  if (!formType) {
    return NextResponse.json({ error: "formType must be 'signup' or 'rooms'" }, { status: 400 })
  }
  if (!accessToken || !spreadsheetId) {
    return NextResponse.json({ error: "A picked Google Sheet is required" }, { status: 400 })
  }
  if (!mapping) return NextResponse.json({ error: "A column mapping is required" }, { status: 400 })
  const mappingCheck = isColumnMappingValid(mapping)
  if (!mappingCheck.ok) return NextResponse.json({ error: mappingCheck.error }, { status: 400 })

  const meet = await loadFormImportMeetContext(meetId)
  if (!meet) return NextResponse.json({ error: "Meet not found" }, { status: 404 })

  let values: string[][]
  try {
    values = await readMappedSheet(accessToken, spreadsheetId, gid)
  } catch (err) {
    if (err instanceof SheetReadError) return NextResponse.json({ error: err.message }, { status: err.status })
    throw err
  }

  const rosterCtx = await loadFormImportRoster(meet.season)
  const roster = [...rosterCtx.lookup.roster]
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
    .map((a) => ({ id: a.id, name: `${a.lastName}, ${a.firstName}` }))

  if (formType === "signup") {
    if (!meet.signupForm) {
      return NextResponse.json({ error: "Sign-ups are not set up for this meet" }, { status: 400 })
    }
    const eventOptions = resolveSignupEventOptions(meet.eventOrder)
    if (eventOptions.length === 0) {
      return NextResponse.json(
        { error: "Import a meet packet so the order of events is available." },
        { status: 400 }
      )
    }
    const questions = normalizeMeetSignupQuestions(meet.signupForm.customQuestions)
    const { rows, errors } = parseSignupResponseRecords(values, mapping, {
      eventOptions,
      questions,
      askNotes: meet.signupForm.askNotes,
    })

    const matches = new Map(
      rows.map((row) => [row.rowNumber, matchImportRow({ name: row.rawName, email: row.rawEmail }, rosterCtx)])
    )
    const { rowOutcomes } = await runSignupResponseImport(meetId, rows, matches, { dryRun: true })
    const outcomeByRow = new Map(rowOutcomes.map((o) => [o.rowNumber, o]))

    return NextResponse.json({
      rows: rows.map((row) => {
        const match = matches.get(row.rowNumber)!
        return {
          rowNumber: row.rowNumber,
          rawName: row.rawName,
          rawEmail: row.rawEmail,
          athleteId: match.athleteId,
          matchedBy: match.matchedBy,
          suggestion: match.suggestion,
          preview: { events: row.events, entryTimes: row.entryTimes, answers: row.answers, notes: row.notes },
          warnings: outcomeByRow.get(row.rowNumber)?.warnings ?? row.warnings,
        }
      }),
      errors,
      roster,
    })
  }

  if (!meet.roomForm) {
    return NextResponse.json({ error: "Roommate preferences are not set up for this meet" }, { status: 400 })
  }
  const questions = normalizeMeetSignupQuestions(meet.roomForm.customQuestions)
  const { rows, errors } = parseRoomResponseRecords(values, mapping, { questions })

  const matches = new Map(
    rows.map((row) => [row.rowNumber, matchImportRow({ name: row.rawName, email: row.rawEmail }, rosterCtx)])
  )
  const { rowOutcomes } = await runRoomResponseImport(meetId, rows, matches, rosterCtx, { dryRun: true })
  const outcomeByRow = new Map(rowOutcomes.map((o) => [o.rowNumber, o]))

  return NextResponse.json({
    rows: rows.map((row) => {
      const match = matches.get(row.rowNumber)!
      return {
        rowNumber: row.rowNumber,
        rawName: row.rawName,
        rawEmail: row.rawEmail,
        athleteId: match.athleteId,
        matchedBy: match.matchedBy,
        suggestion: match.suggestion,
        preview: {
          preferredRoommates: row.rawPreferredNames,
          excludedRoommates: row.rawExcludedNames,
          answers: row.answers,
          notes: row.notes,
        },
        warnings: outcomeByRow.get(row.rowNumber)?.warnings ?? row.warnings,
      }
    }),
    errors,
    roster,
  })
}
